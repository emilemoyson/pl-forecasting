# Elo model

Code: `src/models/elo.py`. Numbers below come from `outputs/elo/tuning.csv`, `outputs/elo/logit_coefficients.csv`, `outputs/elo/ratings_current.csv` and `outputs/backtest/scores.csv`.

## The idea in one paragraph

Each team carries one number, its rating. Before a match, the gap between the two ratings says who should win. After the match, both ratings move towards what actually happened: a surprise moves them a lot, an expected result barely at all. A separate ordered logit then turns the rating gap into home, draw and away probabilities.

## Part 1: the rating update

For a match between home team h and away team a, with ratings R_h and R_a:

```
expected home score   E = 1 / (1 + 10^(-(R_h - R_a + HFA) / 400))
actual home score     S = 1 (home win), 0.5 (draw), 0 (away win)
update                R_h += K * G * (S - E)
                      R_a -= K * G * (S - E)
goal multiplier       G = 1 for a draw or one-goal win, sqrt(goal difference) otherwise
```

What each setting means:

| Setting | Meaning | Chosen |
|---|---|---|
| K | How far ratings move after one match. Higher K reacts faster but is noisier | 20 |
| HFA | Home advantage added to the home rating inside E, in rating points | 0 |
| G | Bigger wins move ratings more (ClubElo's square root rule) | sqrt |
| Pull-back | Share of each team's gap to 1500 removed between seasons | 0.1 |
| Promoted offset | Promoted teams start this many points below the relegated teams' average | 0 |

Rules around the update:

- Every team starts 2014-15 at 1500. Points won by one team are lost by the other, so the league average stays at 1500.
- Ratings are recorded before each matchday and updated after it, so the rating used for a match only reflects matches on earlier dates.
- Between seasons, every rating moves 10% of the way back to 1500 (a 1700 team starts the next season at 1680). Relegated teams leave; promoted teams start at the average rating of the teams they replace.

**Econometrics link.** E is a logistic function of the rating gap, so Elo is a logit model of "home team does better than expected". The update `K * (S - E)` is one step of stochastic gradient descent on the logit log likelihood: the gradient of the log likelihood for one observation is exactly (outcome minus fitted probability) times the regressor. So Elo is an online, one-observation-at-a-time estimator of a logit with a team fixed effect that is allowed to drift. K plays the role of the learning rate.

## Part 2: from rating gap to probabilities (ordered logit)

The rating update only gives one expected score, not three probabilities. We map the gap to H/D/A with an ordered logit, the standard latent variable model for ordered outcomes:

```
latent       y* = beta * x + e,   e ~ logistic,   x = (R_h - R_a) / 100
result       away  if y* < c1
             draw  if c1 <= y* < c2
             home  if y* >= c2
probability  P(away) = L(c1 - beta x),  P(draw) = L(c2 - beta x) - L(c1 - beta x),  P(home) = 1 - L(c2 - beta x)
             where L is the logistic CDF
```

beta, c1 and c2 are estimated by maximum likelihood (statsmodels `OrderedModel`) on every season before the one being predicted, leaving out 2014-15 because its ratings all start at 1500.

| Predicted season | beta (per 100 Elo points) | c1 (away/draw) | c2 (draw/home) | Matches used |
|---|---|---|---|---|
| 2023-24 | 0.535 | -0.892 | 0.241 | 3,040 |
| 2024-25 | 0.545 | -0.894 | 0.236 | 3,420 |
| 2025-26 | 0.538 | -0.878 | 0.256 | 3,800 |

The coefficients barely move from one season to the next, a good sign that the mapping is stable.

**What the numbers say (2025-26 fit):**

| Rating gap (home minus away) | Home | Draw | Away |
|---|---|---|---|
| -100 | 0.311 | 0.273 | 0.416 |
| 0 (equal teams) | 0.436 | 0.270 | 0.294 |
| +100 | 0.570 | 0.235 | 0.195 |
| +200 | 0.694 | 0.182 | 0.124 |

Two equal teams give the home side 44% against 29% for the away side. That home advantage comes from the cutpoints being off-centre (c2 is closer to zero than c1), not from HFA. This is also why the tuning picked HFA = 0: with the rating gap as the only regressor, a constant HFA would shift every match by the same amount, and the cutpoints absorb it. HFA can only matter through the update step, and there it made almost no difference.

## How the settings were chosen

- 720 combinations: K in {10, 15, 20, 25, 30}, HFA in {0, 50, 75, 100}, goal multiplier in {none, sqrt, eloratings index}, pull-back in {0, 0.1, 0.2, 0.33}, promoted offset in {0, 50, 100}. The grid follows the R2 research note.
- Each combination was run on data up to 2022-23 only. For each season from 2016-17 to 2022-23, the ordered logit was fitted on the earlier seasons and scored on that season. The score is the average log loss over those seven seasons.
- The backtest seasons 2023-24 to 2025-26 were never seen during tuning.

**The surface is flat.** The best setting scores 0.9657 and the worst 0.9861. The top ten are all within 0.0003 of each other, so K = 20 against K = 15, or HFA = 0 against HFA = 50, is noise. The settings that clearly matter:

- Using goal difference at all (sqrt or index) beats ignoring it by about 0.002.
- Starting promoted teams below the relegated average hurts: 50 points lower costs 0.002, 100 points lower 0.004.
- Very small or very large K (10 or 30) cost about 0.001.

## Backtest result (2023-24 to 2025-26)

| Season | Market | Elo | Baseline |
|---|---|---|---|
| 2023-24 | 0.901 | 0.926 | 1.054 |
| 2024-25 | 0.967 | 0.984 | 1.081 |
| 2025-26 | 1.012 | 1.040 | 1.084 |
| All | 0.960 | 0.984 | 1.073 |

Log loss, lower is better. Elo closes about 80% of the gap between the baseline and the market.

**Calibration.** Elo is well calibrated across most of the range. The one weak spot is the 70 to 80% bin: it predicted 74% on average and the outcome happened 66% of the time (131 outcomes, about two standard errors). The 80 to 90% bin is fine (84% predicted, 84% observed, 44 outcomes), so this is a mild overconfidence on clear but not overwhelming favourites. Worth watching when the Poisson models arrive.
