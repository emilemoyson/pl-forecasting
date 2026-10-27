// Load data/season_<season>.json (written by `python -m src.publish.export_web`)
// into Postgres. Drops and recreates the three tables, so it is safe to rerun.
//
// Usage (from web/): DATABASE_URL=postgres://... node scripts/seed.mjs [2526]

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

await sql.begin(async (tx) => {
  await tx`DROP TABLE IF EXISTS predictions, model_scores, matches`;
  await tx`
    CREATE TABLE matches (
      match_id     text PRIMARY KEY,
      season       text NOT NULL,
      match_date   date NOT NULL,
      home         text NOT NULL,
      away         text NOT NULL,
      home_goals   int  NOT NULL,
      away_goals   int  NOT NULL,
      home_xg      real NOT NULL,
      away_xg      real NOT NULL,
      odds_close_h real,
      odds_close_d real,
      odds_close_a real
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

  const matches = data.matches.map((m) => ({
    match_id: m.match_id, season: data.season, match_date: m.date, home: m.home, away: m.away,
    home_goals: m.home_goals, away_goals: m.away_goals, home_xg: m.home_xg, away_xg: m.away_xg,
    odds_close_h: m.avg_close_h, odds_close_d: m.avg_close_d, odds_close_a: m.avg_close_a,
  }));
  await tx`INSERT INTO matches ${tx(matches)}`;

  // Insert in chunks to stay under the Postgres parameter limit.
  for (let i = 0; i < data.predictions.length; i += 500) {
    await tx`INSERT INTO predictions ${tx(data.predictions.slice(i, i + 500))}`;
  }

  const scores = data.scores.map((s) => ({
    season: s.season, model: s.model, model_version: s.model_version, n: s.n,
    log_loss: s.log_loss, brier: s.brier, accuracy: s.accuracy,
  }));
  await tx`INSERT INTO model_scores ${tx(scores)}`;
});

const [counts] = await sql`
  SELECT (SELECT count(*) FROM matches)::int      AS matches,
         (SELECT count(*) FROM predictions)::int  AS predictions,
         (SELECT count(*) FROM model_scores)::int AS model_scores`;
console.log(`season ${season} loaded:`, counts);
await sql.end();
