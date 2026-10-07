# R2: Elo settings used by established football Elo systems

Researched 2026-10-07 by the researcher agent. Feeds step 1.5 and decision D1.

## 1. Question

What settings do established football Elo systems use for the K factor, home advantage, the goal-difference multiplier, carry-over between seasons (pull back to the mean) and promoted teams?

## 2. Short answer

ClubElo uses K = 20, multiplies K by the square root of the goal difference for wins, and learns a separate home advantage for each country from the data. The World Football Elo Ratings (eloratings.net) use K between 20 and 60 by match importance, a stepped goal-difference index and a fixed 100-point home advantage. Neither publishes a between-season pull-back for clubs; ClubElo avoids it because it also rates the lower divisions, which we do not have, so our promoted-team rule and pull-back have to be chosen on our own training seasons.

## 3. Findings

### Shared core (all systems)

Expected score for the home team: `W_e = 1 / (10^(-dr/400) + 1)`, where `dr` is home rating minus away rating plus the home advantage. After the match: `R_new = R_old + K x G x (W - W_e)`, with `W` = 1, 0.5 or 0 and `G` the goal-difference multiplier. Points won by one team are lost by the other. Source: eloratings.net/about and clubelo.com/System (via search, accessed 2026-10-07).

### ClubElo (clubelo.com), club football

- **K = 20.** The page explains the trade-off: higher K converges faster but is noisier. Source: http://clubelo.com/System (via search, accessed 2026-10-07; a direct fetch timed out).
- **Goal-difference multiplier:** G = 1 for a draw, G = sqrt(N) for a win by N goals. So a 1-0 counts 1x, 2-0 1.41x, 3-0 1.73x, 4-0 2x. Same source.
- **Home advantage:** not fixed. It starts as a guess and is adjusted every day, separately for each country: if home teams gained more Elo points than away teams, HFA goes up, otherwise down, by `HFA += sum(dElo) x 0.075`. The aim is that, on average, no Elo points flow to home teams. Same source. I did not find the current value for England.
- **Season carry-over and promoted teams:** ClubElo rates second and lower divisions too, so ratings simply continue across seasons and a promoted club arrives with the rating it earned in its lower league. I found no mention of a reset or pull-back. This is my reading of how the system is built, not a quoted rule (medium confidence).

### World Football Elo Ratings (eloratings.net), national teams

- **K by match importance:** 60 World Cup finals, 50 continental finals, 40 qualifiers and major tournaments, 30 other tournaments, 20 friendlies. Source: https://eloratings.net/about and https://en.wikipedia.org/wiki/World_Football_Elo_Ratings (accessed 2026-10-07).
- **Goal-difference index:** K x 1 for a 1-goal win or draw, x 1.5 for 2 goals, x 1.75 for 3 goals, x (1.75 + (N-3)/8) for N >= 4. Same sources.
- **Home advantage:** fixed 100 rating points. Same sources.
- For a domestic league, the closest equivalent is a single fixed K (every league match has the same importance), which is 20 in ClubElo.

### Hvattum and Arntzen (2010), the academic reference for our design

- "Using ELO ratings for match result prediction in association football", International Journal of Forecasting 26(3), 460-470. https://ideas.repec.org/a/eee/intfor/v26yi3p460-470.html (accessed 2026-10-07).
- They put the Elo rating difference into an **ordered logit**, which is exactly what step 1.5 plans. A search summary gives their tuned base settings as base 10, scale 400 and k = 10. From my memory of the paper (not re-checked today), their goal-based version scales K as `k0 x (1 + goal difference)^lambda` with k0 = 10 and lambda = 1, so a 1-goal win counts 2x and a 3-goal win 4x. They found Elo was the most useful single covariate among those tested, but the models still did worse than bookmaker odds. Medium confidence on the exact numbers.

### Between-season pull-back (outside football)

- FiveThirtyEight's NFL Elo pulled every team one third of the way back to the mean (about 1505) at the start of each season, so an 1800 team began the next season at about 1700. https://fivethirtyeight.com/features/introducing-nfl-elo-ratings and https://fivethirtyeight.com/features/nfl-elo-ratings-are-back (accessed 2026-10-07). This is a different sport with much bigger squad turnover, so for the Premier League it is an upper reference, not a target.

### Promoted teams

- Systems that only see top-flight matches have to invent a starting rating. Common choices (search results and hobbyist write-ups, accessed 2026-10-07, low confidence as a "standard"): a fixed rating a bit below the league average, or the average of the teams that went down. Our plan uses the second (average rating of the relegated teams), which keeps the league average stable.
- 2026-27 promoted teams (from our FPL raw file): Ipswich Town, Hull City, Coventry City.

### Notes linking this to the ordered logit (econometrics view, my analysis)

- With the rating difference as the only covariate, a constant home advantage added to `dr` shifts every linear index by the same amount, so the ordered logit cutpoints absorb it. HFA therefore matters through the **update step** (it changes `W_e` and so how many points move after each match), not through the probability mapping.
- The 400 scale does not matter for the logit either (the slope coefficient rescales). What matters is K relative to 400.
- Starting every team at the same rating in 2014-15 means the first season's ratings are mostly noise, so the first season is better used as a burn-in than scored.

## 4. Confidence

**High** for eloratings.net settings (well documented, two sources agree). **High** for ClubElo K = 20 and the sqrt goal multiplier; **medium** for the HFA rule details and for my reading that ClubElo has no pull-back, because I saw the System page only through search snippets. **Medium** for the Hvattum and Arntzen numbers (partly from memory). **Low** that there is any agreed standard for promoted teams in a top-flight-only system.

## 5. Suggestions

- Tune on 2014-15 to 2022-23 only (as planned), with 2014-15 as burn-in, over a small grid: K in {10, 15, 20, 25, 30}; HFA in {0, 50, 75, 100}; goal multiplier none, sqrt(N) (ClubElo) or the eloratings index; pull-back to the mean in {0, 0.1, 0.2, 0.33}. Score each by ordered logit log loss.
- Promoted teams: keep the plan's "average of the relegated teams" as the default, and also try "average of relegated teams minus a fixed amount" in the same grid, since promoted sides usually start weaker than the teams they replace (R6 will check this).
