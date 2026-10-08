# Poisson model on xG (main model)

Code: `src/models/poisson_xg.py`, same engine as the goals model (`src/models/poisson_core.py`). Numbers below come from `outputs/poisson_xg/tuning.csv`, `outputs/poisson_xg/tuning_dixon_coles.csv`, `outputs/poisson_xg/worked_example.csv`, `outputs/poisson_xg/worked_example_grid.csv` and `outputs/backtest/scores.csv`. The goals model's note (`docs/models/poisson_goals.md`) explains the base model; this note covers what changes.

## What changes from the goals model

**1. The response is a blend of xG and goals.**

```
y_ij = w * xG_ij + (1 - w) * goals_ij
log E[y_ij] = c + h * home_ij + att_i + def_j
```

Goals are a noisy measure of how well a team played: a 2.5 xG performance can end 0-0. xG measures the quality of the chances created, so it carries more information about a team's underlying strength per match. Keeping some weight on goals lets the model pick up what xG misses (finishing, set pieces, goalkeepers).

y is no longer a whole number, so this is a **quasi-Poisson** fit: the same estimating equations as the Poisson MLE (the score equations only need the mean to be right, E[y] = lambda), without claiming y is literally Poisson distributed. This is the standard pseudo-maximum-likelihood (PPML) argument from econometrics, as in gravity models of trade.

**2. Recent matches count more (time decay).**

```
weight = 0.5 ^ (age in days / half-life)
```

Each match's contribution to the log likelihood is multiplied by its weight, a weighted MLE. With the chosen half-life of 480 days, a match from a year ago counts 0.59 times as much as one from last week.

**3. The model still predicts goals.** The fitted lambda is the expected value of the blend. It is used as the expected number of goals in the same 0 to 10 scoreline grid as the goals model.

**4. Dixon-Coles correction (tested, not kept).** Dixon and Coles (1997) multiply the four low scorelines by a factor tau that depends on one parameter rho:

```
tau(0,0) = 1 - lambda * mu * rho     tau(0,1) = 1 + lambda * rho
tau(1,0) = 1 + mu * rho              tau(1,1) = 1 - rho
```

A negative rho makes 0-0 and 1-1 more likely, correcting the independent Poisson's tendency to under-predict draws. rho is fitted by MLE on actual goals, holding expected goals fixed.

## How the settings were chosen (D3 and D4)

Everything was chosen by walk-forward log loss on the tuning seasons 2019-20 to 2022-23, using data up to 2022-23 only. The backtest seasons were not used to choose anything.

**D3: blend, decay, window, ridge.** 150 combinations: xG weight 0, 0.25, 0.5, 0.75 or 1; half-life none, 60, 120, 240 or 480 days; window 365 or 1,095 days; ridge 1, 3 or 10. Promoted teams use the relegated-average prior (D2).

Best score for each value, all other settings at their best:

| xG weight | 0 (goals only) | 0.25 | 0.5 | **0.75** | 1 (xG only) |
|---|---|---|---|---|---|
| Log loss | 0.9842 | 0.9803 | 0.9773 | **0.9762** | 0.9769 |

| Half-life (days) | none | 60 | 120 | 240 | **480** |
|---|---|---|---|---|---|
| Log loss | 0.9767 | 0.9811 | 0.9768 | 0.9763 | **0.9762** |

- **xG is what matters.** Moving from goals only to 75% xG improves log loss by 0.008. Pure xG is slightly worse than the blend, so goals add a little on top.
- **Decay barely matters** inside a 365-day window. No decay at all scores 0.9767, against 0.9762 for the best. A very short half-life (60 days) hurts: it throws away too much data.
- **Chosen:** xG weight 0.75, half-life 480 days, window 365 days, ridge 3 (0.9762). The top ten settings are within 0.001 of each other, so the exact choice among them is noise.

**D4: Dixon-Coles.** For the chosen D3 setting, on the tuning seasons:

| | Log loss |
|---|---|
| Without Dixon-Coles | **0.9762** |
| With Dixon-Coles | 0.9770 |

Dixon-Coles does not help on the tuning seasons, so it is dropped. For the record, on the backtest seasons it would have been slightly better (0.9792 against 0.9803). Both gaps are about 0.001, which is noise. The rule is to decide on the tuning seasons, so it stays out.

## Worked example: Arsenal v Leeds (Matchweek 6)

Fit on the 365 days before 6 Oct 2026:

| | Goals model | xG model |
|---|---|---|
| c | 0.178 | 0.289 |
| h (home) | 0.197 | 0.203 |
| Arsenal attack | 0.235 | 0.219 |
| Leeds defence | -0.033 | -0.044 |
| Leeds attack | 0.004 | 0.022 |
| Arsenal defence | -0.434 | -0.391 |
| Expected goals, Arsenal | 1.78 | **1.95** |
| Expected goals, Leeds | 0.78 | **0.92** |

Arsenal: exp(0.289 + 0.203 + 0.219 - 0.044) = exp(0.667) = 1.95. Leeds: exp(0.289 + 0.022 - 0.391) = exp(-0.080) = 0.92.

The xG model expects more goals on both sides: c is higher because xG per team per match ran clearly above actual goals in this window (teams scored fewer goals than their chances were worth).

Scoreline probabilities in % (rows: Arsenal goals, columns: Leeds goals):

| | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **0** | 5.7 | 5.2 | 2.4 | 0.7 | 0.2 |
| **1** | 11.0 | 10.2 | 4.7 | 1.4 | 0.3 |
| **2** | 10.7 | 9.9 | 4.6 | 1.4 | 0.3 |
| **3** | 7.0 | 6.4 | 3.0 | 0.9 | 0.2 |
| **4** | 3.4 | 3.1 | 1.4 | 0.4 | 0.1 |

**Home 61.3%, draw 21.5%, away 17.2%.** The home win probability is the same as the goals model (61.3%). With more expected goals on both sides, the draw is less likely and Leeds' chances go up a little.

## Backtest (2023-24 to 2025-26)

| Season | Market | Poisson xG | Elo | Poisson goals | Baseline |
|---|---|---|---|---|---|
| 2023-24 | 0.901 | 0.938 | 0.926 | 0.944 | 1.054 |
| 2024-25 | 0.967 | 0.969 | 0.984 | 0.972 | 1.081 |
| 2025-26 | 1.012 | 1.034 | 1.040 | 1.039 | 1.084 |
| All | 0.960 | 0.980 | 0.984 | 0.985 | 1.073 |

Log loss, lower is better.
- **Best of our models overall.** Poisson xG is 0.003 ahead of Elo and 0.005 ahead of Poisson goals. Both gaps are under 0.01, so they may be noise (the 3.2 comparison tool will test this).
- **Close to the market in 2024-25.** It is 0.002 behind the market there.
- **Behind Elo in 2023-24.**
- **Gap to the market overall:** 0.021.

## Flag for Matchweek 7: too few draws, too many goals

Check on the backtest seasons (`outputs/poisson_xg/draw_goals_check.csv`, from `python -m src.evaluate.model_checks poisson_xg`):

| Season | Predicted draws | Actual draws | Gap (points) | Predicted goals per team | Actual goals per team |
|---|---|---|---|---|---|
| 2023-24 | 21.2% | 21.6% | -0.4 | 1.60 | 1.64 |
| 2024-25 | 20.8% | 24.5% | -3.6 | 1.65 | 1.47 |
| 2025-26 | 23.1% | 27.4% | -4.3 | 1.47 | 1.38 |
| All | 21.7% | 24.5% | -2.8 | 1.57 | 1.49 |

The model predicts fewer draws than happen, by 2.8 points overall and more in the last two seasons. It also expects more goals than are scored. The two are linked: the model is fitted on a blend that is 75% xG, and xG has run above actual goals, so its expected goals are too high, which spreads the scoreline grid and takes probability away from draws. The gap between xG and goals per team per match has grown every season (`outputs/poisson_xg/xg_vs_goals.csv`): 0.05 in 2023-24, 0.13 in 2024-25, 0.15 in 2025-26 and 0.23 so far in 2026-27, so the live predictions this season are likely to be short of draws by more than the backtest average. The goals model has the same pattern, smaller (-2.1 points). No model change for Matchweek 6. To look at for Matchweek 7, chosen on the tuning seasons as always: putting the expected goals back on the actual-goals scale, and a draw adjustment.
