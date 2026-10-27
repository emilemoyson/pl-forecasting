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
// standings, the points race and the team views.
const TEAM_GAMES = `
  team_games AS (
    SELECT match_id, match_date, true AS is_home, home AS team, away AS opponent,
           home_goals AS gf, away_goals AS ga, ht_home_goals AS ht_gf, ht_away_goals AS ht_ga,
           home_xg AS xgf, away_xg AS xga, home_xpts AS xpts, home_ppda AS ppda, home_deep AS deep,
           home_shots AS shots, home_sot AS sot, home_fouls AS fouls, home_corners AS corners,
           home_yellows AS yellows, home_reds AS reds, ll_model - ll_market AS ll_gap
    FROM matches WHERE season = $1
    UNION ALL
    SELECT match_id, match_date, false, away, home,
           away_goals, home_goals, ht_away_goals, ht_home_goals,
           away_xg, home_xg, away_xpts, away_ppda, away_deep,
           away_shots, away_sot, away_fouls, away_corners,
           away_yellows, away_reds, ll_model - ll_market
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

// ---------------------------------------------------------------------------
// Clubs, season story, team style, players and forecasting views

export type Club = {
  team: string;
  code: string;
  badgeCode: string;
  stadium: string;
  area: string;
  lat: number;
  lon: number;
  colour: string;
};

export async function getClubs(): Promise<Club[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT team, code, badge_code AS "badgeCode", stadium, area, lat, lon, colour
    FROM clubs ORDER BY team`;
  return rows as unknown as Club[];
}

export type WeeklyPosition = { week: number; weekEnd: string; team: string; position: number; points: number };

/** League position at the end of every week (Tuesday to Monday, so Monday games count
 * with the weekend they belong to). */
export async function getWeeklyPositions(): Promise<WeeklyPosition[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES},
     bounds AS (SELECT min(match_date) AS first, max(match_date) AS last FROM matches WHERE season = $1),
     weeks AS (
       -- every Monday from the first Monday on or after the opening game until the final day
       SELECT (row_number() OVER (ORDER BY d))::int AS week, d::date AS week_end
       FROM bounds,
            generate_series(first + ((8 - extract(isodow FROM first)::int) % 7),
                            last + ((8 - extract(isodow FROM last)::int) % 7), interval '7 days') AS d
     ),
     teams AS (SELECT DISTINCT team FROM scored),
     table_at AS (
       SELECT w.week, w.week_end, t.team,
              coalesce(sum(s.pts), 0)::int           AS points,
              coalesce(sum(s.gf - s.ga), 0)::int     AS gd,
              coalesce(sum(s.gf), 0)::int            AS gf
       FROM weeks w
       CROSS JOIN teams t
       LEFT JOIN scored s ON s.team = t.team AND s.match_date <= w.week_end
       GROUP BY w.week, w.week_end, t.team
     )
     SELECT week, to_char(week_end, 'YYYY-MM-DD') AS "weekEnd", team, points,
            (row_number() OVER (PARTITION BY week ORDER BY points DESC, gd DESC, gf DESC, team))::int AS position
     FROM table_at
     ORDER BY week, position`,
    [SEASON],
  );
  return rows as unknown as WeeklyPosition[];
}

export type HtFtFlow = { ht: "W" | "D" | "L"; ft: "W" | "D" | "L"; matches: number };

/** Half-time state to full-time result, from the home side's point of view. */
export async function getHtFt(): Promise<HtFtFlow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT CASE WHEN ht_home_goals > ht_away_goals THEN 'W' WHEN ht_home_goals = ht_away_goals THEN 'D' ELSE 'L' END AS ht,
           CASE WHEN home_goals > away_goals THEN 'W' WHEN home_goals = away_goals THEN 'D' ELSE 'L' END AS ft,
           count(*)::int AS matches
    FROM matches WHERE season = ${SEASON}
    GROUP BY 1, 2`;
  return rows as unknown as HtFtFlow[];
}

export type TeamProfile = {
  team: string;
  played: number;
  points: number;
  xpts: number;
  xgfPerGame: number;
  xgaPerGame: number;
  ppda: number;
  deepPerGame: number;
  shotsPerGame: number;
  sotPerGame: number;
  foulsPerGame: number;
  cornersPerGame: number;
  yellows: number;
  reds: number;
  comebackPoints: number;
  blownPoints: number;
  llGap: number;
};

/** Season averages per team for the style, luck and discipline views. */
export async function getTeamProfiles(): Promise<TeamProfile[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES}
     SELECT team,
            count(*)::int                        AS played,
            sum(pts)::int                        AS points,
            round(sum(xpts)::numeric, 1)::float  AS xpts,
            avg(xgf)::float                      AS "xgfPerGame",
            avg(xga)::float                      AS "xgaPerGame",
            avg(ppda)::float                     AS ppda,
            avg(deep)::float                     AS "deepPerGame",
            avg(shots)::float                    AS "shotsPerGame",
            avg(sot)::float                      AS "sotPerGame",
            avg(fouls)::float                    AS "foulsPerGame",
            avg(corners)::float                  AS "cornersPerGame",
            sum(yellows)::int                    AS yellows,
            sum(reds)::int                       AS reds,
            -- points won from losing positions at half-time
            sum(pts) FILTER (WHERE ht_gf < ht_ga)::int                                   AS "comebackPoints",
            -- points dropped from winning positions at half-time
            sum(3 - pts) FILTER (WHERE ht_gf > ht_ga)::int                               AS "blownPoints",
            avg(ll_gap)::float                   AS "llGap"
     FROM scored
     GROUP BY team
     ORDER BY points DESC`,
    [SEASON],
  );
  return rows.map((r) => ({ ...r, comebackPoints: r.comebackPoints ?? 0, blownPoints: r.blownPoints ?? 0 })) as unknown as TeamProfile[];
}

export type FormPoint = { team: string; game: number; xgd: number; rolling: number };

/** Rolling 6-game xG difference per team, by game played. */
export async function getFormWaves(): Promise<FormPoint[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES}
     SELECT team,
            row_number() OVER w::int                                   AS game,
            (xgf - xga)::float                                         AS xgd,
            avg(xgf - xga) OVER (w ROWS BETWEEN 5 PRECEDING AND CURRENT ROW)::float AS rolling
     FROM scored
     WINDOW w AS (PARTITION BY team ORDER BY match_date, match_id)
     ORDER BY team, game`,
    [SEASON],
  );
  return rows as unknown as FormPoint[];
}

export type TeamGame = {
  matchId: string;
  date: string;
  isHome: boolean;
  opponent: string;
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
  pts: number;
  marketP: number;
};

/** Every game for one team, with the market's probability of the result that happened. */
export async function getTeamGames(team: string): Promise<TeamGame[]> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `WITH ${TEAM_GAMES}
     SELECT s.match_id AS "matchId", to_char(s.match_date, 'YYYY-MM-DD') AS date, s.is_home AS "isHome",
            s.opponent, s.gf, s.ga, round(s.xgf::numeric, 2)::float AS xgf, round(s.xga::numeric, 2)::float AS xga,
            s.pts,
            CASE WHEN s.gf = s.ga THEN p.p_draw
                 WHEN (s.gf > s.ga) = s.is_home THEN p.p_home ELSE p.p_away END AS "marketP"
     FROM scored s
     JOIN predictions p ON p.match_id = s.match_id AND p.model = 'market'
     WHERE s.team = $2
     ORDER BY s.match_date, s.match_id`,
    [SEASON, team],
  );
  return rows as unknown as TeamGame[];
}

export type Player = {
  playerId: string;
  name: string;
  team: string | null;
  teams: string;
  position: string;
  games: number;
  minutes: number;
  goals: number;
  npg: number;
  xg: number;
  npxg: number;
  assists: number;
  xa: number;
  shots: number;
  keyPasses: number;
  xgChain: number;
};

export async function getPlayers(): Promise<Player[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT player_id AS "playerId", name, team, teams, position, games, minutes, goals, npg,
           xg, npxg, assists, xa, shots, key_passes AS "keyPasses", xg_chain AS "xgChain"
    FROM players WHERE season = ${SEASON} AND minutes > 0
    ORDER BY goals DESC, xg DESC`;
  return rows as unknown as Player[];
}

export type CalibrationBin = { model: string; bin: number; n: number; predicted: number; observed: number };

export async function getCalibration(): Promise<CalibrationBin[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT model, bin, n, predicted, observed FROM calibration
    WHERE season = ${SEASON} ORDER BY model, bin`;
  return rows as unknown as CalibrationBin[];
}

export type Scoreline = { homeGoals: number; awayGoals: number; actual: number; expected: number };

export async function getScorelines(): Promise<Scoreline[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT home_goals AS "homeGoals", away_goals AS "awayGoals", actual, expected
    FROM scorelines WHERE season = ${SEASON} ORDER BY home_goals, away_goals`;
  return rows as unknown as Scoreline[];
}

export type Upset = MatchRow & { marketP: number; modelP: number };

/** Matches where the market gave the actual result the lowest probability. */
export async function getUpsets(limit = 8): Promise<Upset[]> {
  const matches = await getMatches();
  const pick = (m: MatchRow, who: "market" | "model") =>
    m.result === "H" ? m[`${who}Home`] : m.result === "D" ? m[`${who}Draw`] : m[`${who}Away`];
  return matches
    .map((m) => ({ ...m, marketP: pick(m, "market"), modelP: pick(m, "model") }))
    .sort((a, b) => a.marketP - b.marketP)
    .slice(0, limit);
}

export async function getClubIndex(): Promise<Record<string, Club>> {
  return Object.fromEntries((await getClubs()).map((c) => [c.team, c]));
}
