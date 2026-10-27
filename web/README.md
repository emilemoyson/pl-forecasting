# PL Forecasting: 2025-26 season dashboard

A Next.js dashboard for the 2025-26 Premier League season: KPI cards, final points, results against xG, the title race, how each model did against the betting market, a sortable league table and every match. Built for the Data Business Visualization class.

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

Tables: `matches` (380 rows), `predictions` (one row per match and model, 1,900 rows), `model_scores` (log loss, Brier, accuracy per model). The league table, KPIs and points race are SQL queries in `src/lib/queries.ts`.

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
