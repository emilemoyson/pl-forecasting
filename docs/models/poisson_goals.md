# Poisson model on goals

Code: `src/models/poisson_core.py` (engine) and `src/models/poisson_goals.py`. Numbers below come from `outputs/poisson_goals/tuning.csv`, `outputs/poisson_goals/worked_example.csv`, `outputs/poisson_goals/worked_example_grid.csv` and `outputs/backtest/scores.csv`.

## The model

Each match gives two observations, one per team. The goals team i scores against team j are Poisson with mean lambda:

```
goals_ij ~ Poisson(lambda_ij)
log lambda_ij = c + h * home_ij + att_i + def_j
```

| Parameter | Meaning |
|---|---|
| c | Log of the average goals per team per match (away side, average teams) |
| h | Home advantage, on the log scale. exp(h) is the multiplier on the home side's expected goals |
| att_i | Team i's attack. Positive means it scores more than average |
| def_j | Team j's defensive weakness. Positive means it concedes more than average |

**Econometrics link.** This is a Poisson GLM with a log link: the regressors are a home dummy, one dummy per team for attack and one per opponent for defence. It is the Maher (1982) model. The coefficients are semi-elasticities: att_i = 0.2 means team i scores about 22% more than average (exp(0.2) = 1.22), all else equal.

**Estimation.** Maximum likelihood, with one addition: a ridge penalty `ridge * sum((att - prior)^2 + (def - prior)^2)` on the team effects. In Bayesian terms this is a normal prior on each team's strength, and the estimate is the posterior mode (MAP). It does two jobs:
- It identifies the model without dropping a reference team.
- It stops a team with few matches from blowing up. A promoted side that has not scored yet would get att = minus infinity under plain MLE.

The fit is done in numpy and scipy (L-BFGS) because it needs the penalty and, for the xG model, weights. A test checks that without the penalty it gives the same expected goals as statsmodels' Poisson GLM (to 0.001 goals) and the same home coefficient.

**Promoted teams (decision D2).** A promoted team's prior is not zero but the average att and def of the teams that went down, taken from a fit just before the season starts. As the promoted team plays, its own matches pull it away from that prior.

**Refits.** Matches are grouped into weeks (Tuesday to Monday). Each week is predicted from a fit on the matches in the 365 days before that week starts, so a week's own results are never used.

## From expected goals to home / draw / away

Home goals and away goals are treated as independent Poisson. The probability of each scoreline is the product of the two Poisson probabilities. Summing the grid (0 to 10 goals each) gives the three outcomes:
- home win: cells below the diagonal (home goals > away goals);
- draw: the diagonal;
- away win: cells above the diagonal.

## Worked example: Arsenal v Leeds (Matchweek 6)

Fit on all matches in the 365 days before 6 Oct 2026:

| | Value |
|---|---|
| c | 0.178 |
| h (home) | 0.197 |
| Arsenal attack | 0.235 |
| Leeds defence | -0.033 |
| Leeds attack | 0.004 |
| Arsenal defence | -0.434 |

Expected goals:
- Arsenal: exp(0.178 + 0.197 + 0.235 - 0.033) = exp(0.578) = **1.78**
- Leeds: exp(0.178 + 0.004 - 0.434) = exp(-0.252) = **0.78**

Arsenal's defence (-0.434) is the big number: it cuts the expected goals of an average attack by about a third (exp(-0.434) = 0.65).

Scoreline probabilities in % (rows: Arsenal goals, columns: Leeds goals):

| | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **0** | 7.7 | 6.0 | 2.3 | 0.6 | 0.1 |
| **1** | 13.8 | 10.7 | 4.2 | 1.1 | 0.2 |
| **2** | 12.3 | 9.5 | 3.7 | 1.0 | 0.2 |
| **3** | 7.3 | 5.7 | 2.2 | 0.6 | 0.1 |
| **4** | 3.2 | 2.5 | 1.0 | 0.3 | 0.0 |

The most likely scores are 1-0 (13.8%), 2-0 (12.3%) and 1-1 (10.7%). Summing the full 0 to 10 grid: **home 61.3%, draw 22.8%, away 15.9%**. Elo gives Arsenal 71% in the same match. The Poisson model is less confident than Elo in this match.

## How the settings were chosen

24 combinations, scored by walk-forward log loss on 2016-17 to 2022-23 only (data up to 2022-23):
- training window: 365, 548 or 730 days;
- ridge: 1, 3, 10 or 30;
- promoted prior: league average or relegated teams' average.

The best is a 365-day window, ridge 3 and the relegated prior (0.9623). Shorter windows did better. 365 days is the shortest in the grid, so recency clearly matters; the xG model handles it properly with time decay instead of a hard window. Ridge 3 is mild: one season gives each team about 38 observations for attack and 38 for defence, so the penalty only bites for teams with few matches. Ridge 30 was clearly worse.

**D2.** The relegated prior beats the league-average prior on the tuning seasons (0.9623 against 0.9634) and on the backtest (0.9849 against 0.9891). Both gaps are small, but they point the same way.

## Backtest (2023-24 to 2025-26)

| Season | Market | Elo | Poisson goals | Baseline |
|---|---|---|---|---|
| 2023-24 | 0.901 | 0.926 | 0.944 | 1.054 |
| 2024-25 | 0.967 | 0.984 | 0.972 | 1.081 |
| 2025-26 | 1.012 | 1.040 | 1.039 | 1.084 |
| All | 0.960 | 0.984 | 0.985 | 1.073 |

Log loss, lower is better. Poisson on goals and Elo are level overall (a gap of 0.001, which is noise). Goals are a noisy measure of how well a team played, which is why the xG version (step 3.1) is the main model.
