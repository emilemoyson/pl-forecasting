// Load data/season_<season>.json (written by `python -m src.publish.export_web`)
// into Postgres. Drops and recreates every table, so it is safe to rerun.
//
// Usage (from web/): npm run seed            (reads DATABASE_URL from .env.local)
//               or: DATABASE_URL=postgres://... node scripts/seed.mjs [2526]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const season = process.argv[2] ?? "2526";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const path = fileURLToPath(new URL(`../data/season_${season}.json`, import.meta.url));
const data = JSON.parse(readFileSync(path, "utf8"));
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Insert in chunks to stay under the Postgres parameter limit.
async function insert(tx, table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    await tx`INSERT INTO ${tx(table)} ${tx(rows.slice(i, i + 200))}`;
  }
}

await sql.begin(async (tx) => {
  await tx`DROP TABLE IF EXISTS predictions, model_scores, players, calibration, scorelines, matches, clubs`;
  await tx`
    CREATE TABLE clubs (
      team        text PRIMARY KEY,
      code        text NOT NULL,
      badge_code  text NOT NULL,
      stadium     text NOT NULL,
      area        text NOT NULL,
      lat         double precision NOT NULL,
      lon         double precision NOT NULL,
      colour      text NOT NULL
    )`;
  await tx`
    CREATE TABLE matches (
      match_id      text PRIMARY KEY,
      season        text NOT NULL,
      match_date    date NOT NULL,
      kickoff_utc   timestamptz NOT NULL,
      home          text NOT NULL REFERENCES clubs(team),
      away          text NOT NULL REFERENCES clubs(team),
      home_goals    int  NOT NULL,
      away_goals    int  NOT NULL,
      ht_home_goals int  NOT NULL,
      ht_away_goals int  NOT NULL,
      home_xg       real NOT NULL,
      away_xg       real NOT NULL,
      home_npxg     real NOT NULL,
      away_npxg     real NOT NULL,
      home_xpts     real NOT NULL,
      away_xpts     real NOT NULL,
      home_ppda     real NOT NULL,
      away_ppda     real NOT NULL,
      home_deep     int  NOT NULL,
      away_deep     int  NOT NULL,
      home_shots    int  NOT NULL,
      away_shots    int  NOT NULL,
      home_sot      int  NOT NULL,
      away_sot      int  NOT NULL,
      home_fouls    int  NOT NULL,
      away_fouls    int  NOT NULL,
      home_corners  int  NOT NULL,
      away_corners  int  NOT NULL,
      home_yellows  int  NOT NULL,
      away_yellows  int  NOT NULL,
      home_reds     int  NOT NULL,
      away_reds     int  NOT NULL,
      referee       text NOT NULL,
      odds_open_h   real,
      odds_open_d   real,
      odds_open_a   real,
      odds_close_h  real,
      odds_close_d  real,
      odds_close_a  real,
      ll_market     double precision NOT NULL,
      ll_model      double precision NOT NULL
    )`;
  await tx`
    CREATE TABLE predictions (
      match_id      text NOT NULL REFERENCES matches(match_id),
      model         text NOT NULL,
      model_version text NOT NULL,
      p_home        double precision NOT NULL,
      p_draw        double precision NOT NULL,
      p_away        double precision NOT NULL,
      PRIMARY KEY (match_id, model)
    )`;
  await tx`
    CREATE TABLE model_scores (
      season        text NOT NULL,
      model         text NOT NULL,
      model_version text NOT NULL,
      n             int  NOT NULL,
      log_loss      double precision NOT NULL,
      brier         double precision NOT NULL,
      accuracy      double precision NOT NULL,
      PRIMARY KEY (season, model)
    )`;
  await tx`
    CREATE TABLE players (
      player_id  text PRIMARY KEY,
      season     text NOT NULL,
      name       text NOT NULL,
      team       text REFERENCES clubs(team),   -- empty when the player moved mid-season
      teams      text NOT NULL,
      position   text NOT NULL,
      games      int  NOT NULL,
      minutes    int  NOT NULL,
      goals      int  NOT NULL,
      npg        int  NOT NULL,
      xg         real NOT NULL,
      npxg       real NOT NULL,
      assists    int  NOT NULL,
      xa         real NOT NULL,
      shots      int  NOT NULL,
      key_passes int  NOT NULL,
      xg_chain   real NOT NULL,
      xg_buildup real NOT NULL,
      yellows    int  NOT NULL,
      reds       int  NOT NULL
    )`;
  await tx`
    CREATE TABLE calibration (
      season    text NOT NULL,
      model     text NOT NULL,
      bin       int  NOT NULL,
      bin_low   double precision NOT NULL,
      bin_high  double precision NOT NULL,
      n         int  NOT NULL,
      predicted double precision NOT NULL,
      observed  double precision NOT NULL,
      PRIMARY KEY (season, model, bin)
    )`;
  await tx`
    CREATE TABLE scorelines (
      season     text NOT NULL,
      home_goals int  NOT NULL,   -- 5 means 5 or more
      away_goals int  NOT NULL,
      actual     int  NOT NULL,
      expected   double precision NOT NULL,
      PRIMARY KEY (season, home_goals, away_goals)
    )`;

  await insert(tx, "clubs", data.clubs.map((c) => ({
    team: c.canonical, code: c.code, badge_code: c.badge_code, stadium: c.stadium, area: c.area,
    lat: c.lat, lon: c.lon, colour: c.colour,
  })));

  await insert(tx, "matches", data.matches.map((m) => ({
    match_id: m.match_id, season: data.season, match_date: m.date, kickoff_utc: m.kickoff_utc,
    home: m.home, away: m.away, home_goals: m.home_goals, away_goals: m.away_goals,
    ht_home_goals: m.ht_home_goals, ht_away_goals: m.ht_away_goals,
    home_xg: m.home_xg, away_xg: m.away_xg, home_npxg: m.home_npxg, away_npxg: m.away_npxg,
    home_xpts: m.home_xpts, away_xpts: m.away_xpts, home_ppda: m.home_ppda, away_ppda: m.away_ppda,
    home_deep: m.home_deep, away_deep: m.away_deep, home_shots: m.home_shots, away_shots: m.away_shots,
    home_sot: m.home_sot, away_sot: m.away_sot, home_fouls: m.home_fouls, away_fouls: m.away_fouls,
    home_corners: m.home_corners, away_corners: m.away_corners,
    home_yellows: m.home_yellows, away_yellows: m.away_yellows, home_reds: m.home_reds, away_reds: m.away_reds,
    referee: m.referee,
    odds_open_h: m.avg_h, odds_open_d: m.avg_d, odds_open_a: m.avg_a,
    odds_close_h: m.avg_close_h, odds_close_d: m.avg_close_d, odds_close_a: m.avg_close_a,
    ll_market: m.ll_market, ll_model: m.ll_model,
  })));

  await insert(tx, "predictions", data.predictions);

  await insert(tx, "model_scores", data.scores.map((s) => ({
    season: s.season, model: s.model, model_version: s.model_version, n: s.n,
    log_loss: s.log_loss, brier: s.brier, accuracy: s.accuracy,
  })));

  await insert(tx, "players", data.players.map((p) => ({ season: data.season, ...p })));
  await insert(tx, "calibration", data.calibration.map((c) => ({ season: data.season, ...c })));
  await insert(tx, "scorelines", data.scorelines.map((s) => ({ season: data.season, ...s })));
});

const [counts] = await sql`
  SELECT (SELECT count(*) FROM clubs)::int        AS clubs,
         (SELECT count(*) FROM matches)::int      AS matches,
         (SELECT count(*) FROM predictions)::int  AS predictions,
         (SELECT count(*) FROM model_scores)::int AS model_scores,
         (SELECT count(*) FROM players)::int      AS players,
         (SELECT count(*) FROM calibration)::int  AS calibration,
         (SELECT count(*) FROM scorelines)::int   AS scorelines`;
console.log(`season ${season} loaded:`, counts);
await sql.end();
