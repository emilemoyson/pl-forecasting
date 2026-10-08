# Roadmap: PL Forecasting Engine

From now (Wed 7 Oct 2026) to submission (Nov 12, 23:59 ET, aim for Nov 11).

## How to use this file

- Work through the steps in order. Tick a step `[x]` only after the data-checker passes.
- A step marked **STOP** ends with a short summary of the results, then waits for Emile.
- Each step lists: who does it, Emile's time, inputs, outputs, and "Done when" checks.
- Phases 1 and 2 are detailed. Later phases are an outline and get detailed as we go.
- From Phase 2 on, new models are built on a git branch and merged only after the data-checker passes, so `main` can always make the weekly predictions.
- Every choice goes in `docs/decisions.md`. Every matchweek gets an entry in `docs/weekly_log.md`.
- Every model step (1.5, 2.3, 3.1, 4.6, 5.4) also writes a one-page maths note in `docs/models/<model>.md`: the formula, what each parameter means, how it was estimated, and how it links to standard econometrics (logit, MLE, GLMs, Kalman filter). Shown at the STOP with the results. No waiting before the step starts.

## Subagents

| Agent | Job | Can | Cannot |
|---|---|---|---|
| data-checker | Checks each step's output and looks for leakage | Read files, run read-only checks | Edit anything |
| researcher | Looks things up, writes sourced notes, suggests changes | Search the web, write in `docs/research/` | Edit code, data or this plan |
| news-checker | Team news before each matchweek, player availability | Search the web, write in `outputs/news/` | Run after a match has kicked off |
| analyst (Phase 5) | Plain-English note on each prediction | Read outputs | Compute or change numbers |
| model-monitor (Phase 5) | Weekly review of model performance | Read outputs | Change models |

**Suggestions rule:** the researcher never changes the plan. It adds suggestions to `docs/research/suggestions.md` with status `proposed`. Only Emile marks them `accepted` or `rejected`, and only accepted ones change the plan.

## Weekly rhythm (from Matchweek 7)

| Day | What |
|---|---|
| Mon/Tue | Settle last matchweek: results, live scores, news-checker scores, weekly log |
| Tue to Thu | Build the next planned step (on a branch) |
| Thu | Refresh current-season data, researcher checks for fixture changes |
| Fri | news-checker, predictions, review (STOP), push before Fri 23:00 UTC |

## Decision points for Emile

| # | Decision | Step |
|---|---|---|
| D1 | Accept Elo settings | 1.5 |
| D2 | How promoted teams start in the Poisson model | 2.3 |
| D3 | xG vs goals blend and time decay | 3.1 |
| D4 | Keep or drop the Dixon-Coles low-score correction | 3.1 |
| D5 | Paper betting threshold | 4.1 |
| D6 | Replacement factor for news adjustments | 4.3 |
| D7 | State-space model design: how strengths drift, how they are updated | 5.4 |

## Research tasks

| # | Question | When |
|---|---|---|
| R1 | Where to get bookmaker odds for upcoming matches before kickoff (check football-data first, then free alternatives). Which columns, how often updated, terms | Phase 1, urgent |
| R2 | Elo settings used by established football Elo systems (e.g. ClubElo): K factor, home advantage, season carry-over | Phase 1 |
| R3 | How to read actual starts and minutes per player from the FPL API after a gameweek | Phase 1 |
| R4 | Reliable team news sources: press conference reports, official club injury news, reputable outlets, and when they publish | Phase 1 |
| R5 | Fixture calendar check: midweek rounds, postponements, changed kickoff times | Every Thursday |
| R6 | How promoted teams typically perform in their first season, as a starting prior | Phase 2 |
| R7 | Terms of use for football-data, Understat and the FPL API | Phase 2 |
| R8 | Key papers (Maher 1982, Dixon and Coles 1997) and published log loss figures for bookmaker odds, for the write-up | Phase 3 |
| R9 | Favourite-longshot bias in football betting markets, and the Shin model for removing bookmaker margins | Phase 4 |
| R10 | Dynamic team strength models, especially Koopman and Lit (2015) on the Premier League: model, estimation method, simpler approximations | Phase 4 |

Research notes go in `docs/research/<topic>.md` with: question, short answer, findings with links and dates, confidence, suggestion.

---

## Phase 1: First live predictions (Matchweek 6)

Deadline: pushed before Fri 9 Oct 23:00 UTC. First kickoff Sat 10 Oct 11:30 UTC.
Models live this week: baseline, Elo, market. News-checker logs availability (not used in predictions yet).

### [x] 1.0 Setup
- Who: main agent. Emile's time: 10 min.
- Subagent files in `.claude/agents/`, Workflow section in CLAUDE.md, empty `docs/research/suggestions.md` and `docs/weekly_log.md`.
- Done when: the three agent files exist, CLAUDE.md points to this plan.

### [x] 1.1 Master matches table
- Done on 7 Oct (commit 961a785). `data/processed/matches.parquet`, 4,610 matches.

### [x] 1.2 Research R1 to R4
- Who: researcher (can run while 1.3 is being built). Emile's time: 15 min to read.
- Outputs: four notes in `docs/research/`, suggestions in `suggestions.md`.
- Done when: R1 names a concrete source for this weekend's odds, or says clearly there isn't a free one.

### [x] 1.3 Scoreboard
- Who: main agent. Emile's time: 10 min.
- Inputs: any predictions file in the standard format, plus `matches.parquet`.
- Outputs: `src/evaluate/scoreboard.py` returning log loss, Brier score, accuracy, and a calibration chart (10 bins) saved to `outputs/`.
- Done when: tests with hand-made examples pass (100% on the right result gives log loss 0, one third each gives about 1.099).

### [x] 1.4 Market and baseline on the backtest seasons (STOP)
- Who: main agent. Emile's time: 20 min.
- Market: market average closing odds, margin removed by proportional normalisation, for 2023-24 to 2025-26.
- Baseline: home / draw / away frequencies from all seasons before the one being predicted.
- Outputs: `outputs/backtest/market.csv`, `outputs/backtest/baseline.csv`, scores per season and overall.
- Done when: probabilities sum to 1, the market clearly beats the baseline.
- **STOP:** both scores, and the market's average margin per season.

### [x] 1.5 Elo (STOP, decision D1)
- Who: main agent, informed by R2. Emile's time: 20 min.
- Elo with a home advantage term, updated after every match. Between seasons, ratings are pulled partly back to the average. Promoted teams start at the average rating of the relegated teams.
- Rating difference to home / draw / away probabilities with an ordered logit (statsmodels `OrderedModel`), fitted only on matches before the season being predicted.
- K factor, home advantage and pull-back chosen on 2014-15 to 2022-23 only. Never tuned on the backtest seasons.
- Walk-forward over 2023-24 to 2025-26.
- Outputs: `src/models/elo.py`, `outputs/backtest/elo.csv`, scores.
- Done when: Elo lands between baseline and market, data-checker confirms no future data used.
- **STOP:** Elo vs baseline vs market, chosen settings, top 5 and bottom 5 teams by current rating.

### [ ] 1.6 Live prediction pipeline
- Who: main agent. Emile's time: 15 min.
- One command (`python -m src.pipeline --matchweek N`): refresh 2026-27 data (football-data, Understat, FPL), update Elo, predict the matchweek's fixtures from the FPL feed.
- Writes `predictions/2026-27/mw06.csv`, one row per match per model (baseline, elo), with model_version and the git commit hash.
- Logs the market's pre-kickoff probabilities from the R1 source in `predictions/2026-27/mw06_market.csv`, with the time the odds were collected.
- Done when: 10 matches, probabilities sum to 1, every timestamp is before its kickoff.

### [ ] 1.7 News-checker, first run
- Who: news-checker, run on Friday after press conferences. Emile's time: 15 min to skim.
- Outputs: `outputs/news/2026-27/mw06_availability.csv` and `mw06_notes.md` (see the agent file for the format).
- Also, in Python: a baseline start probability per player = share of their team's matches this season the player started × FPL chance of playing / 100 (100 if empty). Saved as `mw06_availability_baseline.csv`.
- Done when: every team in the matchweek is covered, every row has a source link and a collection time before kickoff.

### [ ] 1.8 Review and push (STOP)
- Who: data-checker, then Emile. Emile's time: 15 min.
- **STOP:** show the predictions table (all models plus market) and the 5 biggest news items. After Emile approves: commit and push predictions and news files before Fri 23:00 UTC.
- Done when: the push is visible on GitHub with a time before the first kickoff.

---

## Phase 2: Poisson on goals (Matchweek 7, Oct 17)

### [ ] 2.1 Settle Matchweek 6
- After the last match (Mon 12 Oct). Refresh results, score the live predictions, score news-checker vs the baseline start probabilities (Brier score) using actual starts (R3).
- First entry in `docs/weekly_log.md`: predictions, results, scores, notable news calls.

### [ ] 2.2 /matchweek command and push guard
- A Claude Code command `.claude/commands/matchweek.md` running: refresh, predict, data-checker, news-checker, show results, wait for approval, push.
- A test that fails if any prediction or news row has a timestamp at or after its kickoff. Run before every push.
- Done when: a dry run for Matchweek 7 works without pushing.

### [ ] 2.3 Poisson GLM on goals (STOP, decision D2)
- On a branch. Two rows per match (one per team): goals ~ home + attack team + defence team, Poisson family, statsmodels.
- Refit before each matchweek on past matches only. Expected goals for both sides give a scoreline grid (0 to 10 goals each), summed into home / draw / away.
- Promoted teams' starting strength from R6 and the backtest.
- Walk-forward over the backtest seasons.
- **STOP:** Poisson vs Elo vs baseline vs market, calibration chart, promoted-team choice.

### [ ] 2.4 Matchweek 7 live
- Via `/matchweek`. Models: baseline, Elo, Poisson goals, market. News-checker runs as before.
- Push before Fri 16 Oct 23:00 UTC.

---

## Phase 3: Main model on xG (Matchweek 8, Oct 24)

Outline, detailed later.
- 3.1 Poisson on xG (STOP, D3, D4): fit on a blend of xG and goals, recent matches weighted more. Blend weight and decay tuned on 2019-20 to 2022-23. Dixon-Coles low-score correction fitted on actual goals, kept only if it improves the backtest.
- 3.2 Model comparison tool: Diebold-Mariano test on per-match log loss differences, with the paired bootstrap as a second check. Says whether a gap between two models is real or noise.
- 3.3 Settle Matchweek 7.
- 3.4 Matchweek 8 live with the main model.
- Emile: finish DataCamp courses by Oct 25.

## Phase 4: Market analysis and Claude's news (Matchweek 9, around Oct 31)

Outline.
- 4.1 Paper trading backtest (STOP, D5): flat €10 at Bet365 pre-match odds when model and market differ by more than a threshold (try 2, 3 and 5 points). Fractional Kelly staking as a second rule, next to flat stakes. Profit, ROI, number of bets, worst losing run, bootstrap range. Closing line value against market average closing. Max odds as an upper bound, ignoring matches where max odds add up to under 0.97.
- 4.2 "Who was right" table: matches where model and market differ by more than 5 points, scored separately.
- 4.3 News adjustments (D6): Python turns the availability file into an attack adjustment per team, using each absent player's share of team xG and a replacement factor. Both versions (with and without news) logged every week.
- 4.4 Live paper bets logged before kickoff from Matchweek 9.
- 4.5 Settle Matchweek 8, Matchweek 9 live.
- 4.6 Market efficiency (STOP): test for favourite-longshot bias (regress outcomes on market implied probabilities, by odds bucket). Compare proportional margin removal with the Shin model, and rescore the market benchmark both ways. Informed by R9.
- Emile: describe the project in GrowthPlan by Nov 1.

## Phase 5: Dashboard and agents (Matchweek 10, around Nov 7)

Outline.
- 5.1 Streamlit: next matchweek page, model performance page (ladder table, calibration, live log), market and paper trading page.
- 5.2 analyst agent: one short note per match explaining the prediction, from output files only.
- 5.3 model-monitor agent: weekly review in the weekly log.
- 5.4 Challenger: dynamic state-space model (STOP, D7). Team attack and defence strengths as hidden states that drift each week (random walk), updated after every matchweek with an approximate Kalman filter on goals or xG. Drift size tuned on 2014-15 to 2022-23. Walk-forward backtest, compared with the static Poisson using the 3.2 tool. Informed by R10. Built on a branch, starting in Phase 4 if time allows.
- XGBoost dropped (decision 7 Oct): the challenger is the state-space model instead. Research question 2 becomes: does modelling team strength as a moving state beat a static model?
- 5.5 Matchweek 10 live. Feature freeze Nov 6.

## Phase 6: Write-up and submission (Nov 9 to 11)

Outline.
- 6.1 Settle the last matchweek, freeze all numbers.
- 6.2 README with one-command rerun, pinned requirements.
- 6.3 Write-up draft from decisions.md, weekly_log.md and results. Emile edits. Include Elo as a logit with stochastic gradient updates.
- 6.4 Demo video script, recording.
- 6.5 Submit by Nov 11. Emile books and takes the final test (Nov 9 to 15).
