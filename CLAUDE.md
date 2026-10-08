# PL Forecasting Engine

Predicts Premier League matches, measures how good the predictions are, and compares them against the betting market. Built for the ieNYC x DataCamp "Master in Claude" challenge and as a portfolio project for quant / trading interviews. Deadline: Nov 12, 2026.

The market comparison is the heart of the project. When in doubt, spend effort there.

## Golden rules

1. **Python does the maths, Claude explains.** Every number comes from code. Agents read numbers from files and never compute or invent them.
2. **No leakage.** Every input to a prediction must be known before kickoff. Each feature is built from matches with `date < kickoff` only. If unsure whether something leaks, stop and ask.
3. **Odds are never a model feature.** They are only the benchmark.
4. **Time order only.** No random train/test splits, no shuffling. Walk-forward: train up to matchweek t, predict t+1, repeat.
5. **Raw data is read-only.** Never edit files in `data/raw/`. Completed seasons are downloaded once and never again. The current season (2026-27) is re-downloaded before each matchweek, overwriting only the current-season files, for both football-data and Understat. All cleaning happens in code and writes to `data/processed/`.
6. **Paper trading only.** Hypothetical flat stakes, no real money.
7. **Small steps.** Build only the current step. Do not add models, pages or agents that were not asked for.

## Pipeline order

1. Collect: download results + odds, xG, FPL data
2. Clean: one master matches table with canonical team names
3. Features: rolling stats, Elo, rest days (all pre-kickoff)
4. Models: produce probabilities for each match
5. Evaluate: log loss, Brier, accuracy, calibration, market gap
6. Paper trade: hypothetical bets, profit, closing line value
7. Publish: append to the prediction log, push to GitHub before kickoff
8. Explain: agents write notes from the output files
9. Dashboard: Streamlit reads `outputs/` and `predictions/`

## Model ladder

| Name | What it is |
|---|---|
| `baseline` | League-average home / draw / away frequencies |
| `elo` | Elo ratings, converted to H/D/A probabilities |
| `poisson_goals` | Poisson GLM: goals ~ home + attack team + defence team |
| `poisson_xg` | Same, fitted on xG (or an xG/goals blend), recent matches weighted more. Main model |
| `dixon_coles` | Poisson + low-score correction. Kept only if it helps on the tuning seasons (never chosen on the backtest) |
| `state_space` | Team strengths as hidden states that drift each week, updated with an approximate Kalman filter. The challenger model |
| `market` | Bookmaker odds with the margin removed. The benchmark |

## Prediction format (every model)

Every model writes rows with exactly these columns, so one scoreboard scores them all:

`match_id, model, model_version, created_at_utc, p_home, p_draw, p_away`

Probabilities sum to 1 (check it). Goals models may add `exp_home_goals, exp_away_goals` and a scoreline grid in a separate file.

## Data

- **football-data.co.uk**: results and odds. Season files like `https://www.football-data.co.uk/mmz4281/2526/E0.csv`. Inspect the header and report which odds columns are actually filled (pre-match and closing, Pinnacle vs market average) before choosing one.
- **Understat**: team xG per match. Prefer an existing library (e.g. `soccerdata`) over a custom scraper. Respect the site, cache locally, no repeated scraping.
- **FPL API**: `https://fantasy.premierleague.com/api/bootstrap-static/` and `/api/fixtures/`.
- Seasons: training history from 2014-15, backtest on 2023-24, 2024-25, 2025-26, live on 2026-27.
- Team names: every source maps to one canonical name via `data/team_names.csv`. Any unmapped name is an error, not a warning.
- All dates and times stored in UTC.
- Raw scraped data is not committed to the public repo (see `.gitignore`). The download scripts are, so anyone can rebuild it.

## Evaluation

- Main metric: log loss on H/D/A. Also Brier score, accuracy, calibration chart.
- Market margin removal: proportional normalisation by default (divide each implied probability by their sum).
- Comparing two models: report the difference plus a bootstrap over matches. Differences under about 0.01 log loss are probably noise; say so.

## Prediction log

- `predictions/` is append-only. Never edit or delete past rows.
- Each matchweek is committed and pushed before the first kickoff. The GitHub push time is the proof.
- Every row records which model and version made it.

## Repo layout

```
src/collect/     download scripts
src/clean/       master table, team name mapping
src/features/    feature building
src/models/      one file per model
src/evaluate/    scoreboard, backtest, market, paper trading
data/raw/        untouched downloads (not committed)
data/processed/  cleaned tables
predictions/     timestamped prediction log (committed)
outputs/         files the agents and dashboard read
dashboard/       Streamlit app
docs/            decisions.md and write-up material
tests/           pytest
```

## Coding conventions

- Python 3.11+, pandas, statsmodels, scikit-learn. Run modules with `python -m src.<package>.<module>`.
- Small, plain functions. Type hints. Short docstrings that say what goes in and what comes out.
- Every new step ends with sanity checks printed to the terminal: row counts, missing values, value ranges, probabilities summing to 1.
- Add a pytest for anything that could silently go wrong (team mapping, no-leakage checks, probability sums).
- When a choice is made (a season range, a threshold, a model kept or dropped), add one line to `docs/decisions.md`: date, decision, reason.

## Working with Emile

- He has an econometrics background. Explain in plain terms with concrete examples, link models to the econometrics he knows (GLMs, logit, MLE).
- After each step, summarise in a few lines: what was built, the sanity check results, anything that looked odd, the suggested next step.
- Ask before big or irreversible choices. Do not guess at scope.
- Prose he will reuse (README, write-up, docs) must sound natural and never use em dashes.

## Workflow

- `docs/plan.md` is the roadmap. Follow it one step at a time, in order.
- After each step, run the `data-checker` subagent. Tick the step `[x]` in `docs/plan.md` only when it passes.
- At every step marked **STOP**, summarise the results and wait until Emile replies before going on.
- The `researcher` only suggests changes, as `proposed` lines in `docs/research/suggestions.md`. It never edits the plan. Only Emile marks a suggestion accepted or rejected.
- Subagents live in `.claude/agents/`: `data-checker`, `researcher`, `news-checker`.
- Every matchweek gets an entry in `docs/weekly_log.md`.

## Current step

Phase 1 of `docs/plan.md`: first live predictions for Matchweek 6 (baseline, Elo, market), pushed before Fri 9 Oct 23:00 UTC. First kickoff Sat 10 Oct 11:30 UTC.
