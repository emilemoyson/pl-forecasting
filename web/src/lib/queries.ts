import { getSql } from "./db";

export const SEASON = "2526";

export type Standing = {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  xgf: number;
  xga: number;
};

export type Kpis = {
  matches: number;
  goals: number;
  goalsPerMatch: number;
  xgPerMatch: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  favouriteWinPct: number;
};

export type RacePoint = { team: string; game: number; points: number };

export type ModelScore = {
  model: string;
  modelVersion: string;
  n: number;
  logLoss: number;
  brier: number;
  accuracy: number;
};

export type MatchRow = {
  matchId: string;
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
  result: "H" | "D" | "A";
  marketHome: number;
  marketDraw: number;
  marketAway: number;
  modelHome: number;
  modelDraw: number;
  modelAway: number;
};

// One row per team per match, from that team's point of view. Reused by the
// standings and the points race.
const TEAM_GAMES = `
  team_games AS (
    SELECT match_id, match_date, home AS team, home_goals AS gf, away_goals AS ga,
           home_xg AS xgf, away_xg AS xga
    FROM matches WHERE season = $1
    UNION ALL
    SELECT match_id, match_date, away, away_goals, home_goals, away_xg, home_xg
    FROM matches WHERE season = $1
  ),
  scored AS (
    SELECT *, CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END AS pts
    FROM team_games
  )`;

export async function getStandings(): Promise<Standing[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES}
     SELECT team,
            count(*)::int                    AS played,
            count(*) FILTER (WHERE pts = 3)::int AS won,
            count(*) FILTER (WHERE pts = 1)::int AS drawn,
            count(*) FILTER (WHERE pts = 0)::int AS lost,
            sum(gf)::int                     AS gf,
            sum(ga)::int                     AS ga,
            (sum(gf) - sum(ga))::int         AS gd,
            sum(pts)::int                    AS points,
            round(sum(xgf)::numeric, 1)::float AS xgf,
            round(sum(xga)::numeric, 1)::float AS xga
     FROM scored
     GROUP BY team
     ORDER BY points DESC, gd DESC, gf DESC, team`,
    [SEASON],
  );
  return rows.map((r, i) => ({ rank: i + 1, ...r }) as unknown as Standing);
}

export async function getKpis(): Promise<Kpis> {
  const sql = getSql();
  const [r] = await sql.unsafe(
    `SELECT count(*)::int                                   AS matches,
            sum(m.home_goals + m.away_goals)::int           AS goals,
            avg(m.home_goals + m.away_goals)::float         AS goals_per_match,
            avg(m.home_xg + m.away_xg)::float               AS xg_per_match,
            avg((m.home_goals > m.away_goals)::int)::float  AS home_win_pct,
            avg((m.home_goals = m.away_goals)::int)::float  AS draw_pct,
            avg((m.home_goals < m.away_goals)::int)::float  AS away_win_pct,
            -- The market favourite is the outcome with the highest closing probability.
            avg(CASE
                  WHEN p.p_home >= greatest(p.p_draw, p.p_away) THEN (m.home_goals > m.away_goals)::int
                  WHEN p.p_away >= p.p_draw                     THEN (m.home_goals < m.away_goals)::int
                  ELSE (m.home_goals = m.away_goals)::int
                END)::float                                 AS favourite_win_pct
     FROM matches m
     JOIN predictions p ON p.match_id = m.match_id AND p.model = 'market'
     WHERE m.season = $1`,
    [SEASON],
  );
  return {
    matches: r.matches,
    goals: r.goals,
    goalsPerMatch: r.goals_per_match,
    xgPerMatch: r.xg_per_match,
    homeWinPct: r.home_win_pct,
    drawPct: r.draw_pct,
    awayWinPct: r.away_win_pct,
    favouriteWinPct: r.favourite_win_pct,
  };
}

/** Cumulative points after each game for the given teams. */
export async function getPointsRace(teams: string[]): Promise<RacePoint[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES}
     SELECT team,
            row_number() OVER w::int AS game,
            sum(pts) OVER w::int     AS points
     FROM scored
     WHERE team = ANY($2)
     WINDOW w AS (PARTITION BY team ORDER BY match_date, match_id)
     ORDER BY team, game`,
    [SEASON, teams],
  );
  return rows as unknown as RacePoint[];
}

export async function getModelScores(): Promise<ModelScore[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT model, model_version AS "modelVersion", n, log_loss AS "logLoss", brier, accuracy
    FROM model_scores WHERE season = ${SEASON}
    ORDER BY log_loss`;
  return rows as unknown as ModelScore[];
}

/** Every match with the market's and the main model's (poisson_xg) probabilities. */
export async function getMatches(): Promise<MatchRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT m.match_id AS "matchId", to_char(m.match_date, 'YYYY-MM-DD') AS date,
           m.home, m.away, m.home_goals AS "homeGoals", m.away_goals AS "awayGoals",
           round(m.home_xg::numeric, 2)::float AS "homeXg",
           round(m.away_xg::numeric, 2)::float AS "awayXg",
           CASE WHEN m.home_goals > m.away_goals THEN 'H'
                WHEN m.home_goals = m.away_goals THEN 'D' ELSE 'A' END AS result,
           max(p.p_home) FILTER (WHERE p.model = 'market')     AS "marketHome",
           max(p.p_draw) FILTER (WHERE p.model = 'market')     AS "marketDraw",
           max(p.p_away) FILTER (WHERE p.model = 'market')     AS "marketAway",
           max(p.p_home) FILTER (WHERE p.model = 'poisson_xg') AS "modelHome",
           max(p.p_draw) FILTER (WHERE p.model = 'poisson_xg') AS "modelDraw",
           max(p.p_away) FILTER (WHERE p.model = 'poisson_xg') AS "modelAway"
    FROM matches m
    JOIN predictions p ON p.match_id = m.match_id
    WHERE m.season = ${SEASON}
    GROUP BY m.match_id
    ORDER BY m.match_date, m.match_id`;
  return rows as unknown as MatchRow[];
}
