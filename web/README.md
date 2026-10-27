# PL Forecasting: 2025-26 season dashboard

A Next.js dashboard for the 2025-26 Premier League season, built for the Data Business Visualization class. Five tabs:

- **Overview**: KPI cards, a map of England with every club's crest at its ground, final points, the title race.
- **Season**: league position week by week (bump chart), all 380 results in one grid, half-time to full-time flows, comebacks.
- **Teams**: attack vs defence and pressing vs penetration maps, luck (points vs expected points), form waves, discipline. Each club has its own page.
- **Players**: goals vs xG scatter and a searchable leaderboard (Understat).
- **Forecasting**: models against the market, calibration, biggest upsets, which clubs the model read better, scorelines vs the Poisson model.

The site reads everything from a Postgres database at request time. Match data is not committed to this public repo; it goes from the local pipeline into the database.

## How the data gets there

```
data/processed/matches.parquet  ─┐
outputs/backtest/*.csv          ─┼─ python -m src.publish.export_web ─► web/data/season_2526.json
                                                                          │
                                                        npm run seed ─────┴─► Postgres (3 tables)
                                                                                  │
                                                        Next.js page (SQL) ◄──────┘
```

Tables: `clubs` (20, with ground coordinates from `data/clubs.csv`), `matches` (380, with half-time score, shots, cards, xG, expected points, pressing and odds), `predictions` (1,900), `model_scores`, `players` (537), `calibration` and `scorelines`. Anything that needs real maths (log loss, calibration, expected scorelines) is computed in Python; tables, positions by week, form and team profiles are SQL queries in `src/lib/queries.ts`.

The map uses Esri canvas tiles (no API key). Crests load from the Premier League image server; a monogram shows if one fails.

## Deploying on Vercel

1. In Vercel, import the `pl-forecasting` GitHub repo and set **Root Directory** to `web`.
2. In the project, open **Storage**, create a **Neon** (Postgres) database and connect it. This adds `DATABASE_URL` to the project.
3. Copy `DATABASE_URL` from the project settings into `web/.env.local` (this file is git-ignored).
4. From the repo root: `python -m src.publish.export_web`, then from `web/`: `npm run seed`.
5. Redeploy, or just open the site. It queries the database on each request, cached for an hour.

## Running locally

```
cd web
npm install
npm run seed     # needs DATABASE_URL in .env.local
npm run dev      # http://localhost:3000
```
