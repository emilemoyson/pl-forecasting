"""Elo ratings turned into home / draw / away probabilities with an ordered logit.

Ratings: every team starts 2014-15 at 1500. After each match both teams
move by K x G x (actual - expected), where expected comes from the
rating gap plus a home advantage, and G grows with the goal difference.
Between seasons ratings are pulled part of the way back to 1500.
Promoted teams start at the average rating of the relegated teams,
minus an optional offset.

Ratings are recorded before each matchday and updated after it, so the
rating used for a match only ever reflects matches on earlier dates.

Probabilities: an ordered logit (statsmodels OrderedModel) of the result
(away < draw < home) on the pre-match rating difference, fitted only on
seasons before the one being predicted (2014-15 is a burn-in and never
used to fit).

Settings are tuned on 2014-15 to 2022-23 only, then frozen for the
backtest seasons 2023-24 to 2025-26.

Usage: python -m src.models.elo
"""

from __future__ import annotations

import itertools
import warnings
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from statsmodels.miscmodels.ordinal_model import OrderedModel

from src.models.common import BACKTEST_SEASONS, ROOT_DIR, load_matches, save_backtest, to_standard

MODEL = "elo"
OUT_DIR = ROOT_DIR / "outputs" / "elo"

START_RATING = 1500.0
BURN_IN_SEASON = "1415"
LAST_TUNING_SEASON = "2223"
TUNING_SCORED_SEASONS = ["1617", "1718", "1819", "1920", "2021", "2122", "2223"]
ORDER = ["away", "draw", "home"]  # ordered logit categories, low to high

GRID = {
    "k": [10, 15, 20, 25, 30],
    "hfa": [0, 50, 75, 100],
    "goal_mult": ["none", "sqrt", "index"],
    "pull_back": [0.0, 0.1, 0.2, 0.33],
    "promoted_offset": [0, 50, 100],
}


@dataclass(frozen=True)
class EloParams:
    k: float = 20
    hfa: float = 75
    goal_mult: str = "sqrt"  # none | sqrt (ClubElo) | index (eloratings.net)
    pull_back: float = 0.2  # share of the gap to 1500 removed between seasons
    promoted_offset: float = 0  # promoted teams start this far below the relegated average

    def version(self) -> str:
        return (f"v1_k{self.k:g}_hfa{self.hfa:g}_{self.goal_mult}"
                f"_pb{self.pull_back:g}_off{self.promoted_offset:g}")


# Accepted at decision D1 (2026-10-08). Used for live predictions.
ACCEPTED = EloParams(k=20, hfa=0, goal_mult="sqrt", pull_back=0.1, promoted_offset=0)


def goal_multiplier(goal_diff: int, kind: str) -> float:
    """G in the update. Draws and 1-goal wins give 1; bigger wins move ratings more."""
    n = abs(int(goal_diff))
    if kind == "none" or n <= 1:
        return 1.0
    if kind == "sqrt":
        return float(np.sqrt(n))
    if kind == "index":
        return {2: 1.5, 3: 1.75}.get(n, 1.75 + (n - 3) / 8)
    raise ValueError(f"unknown goal multiplier {kind}")


def expected_home(r_home: float, r_away: float, hfa: float) -> float:
    """Expected score for the home team (win = 1, draw = 0.5)."""
    return 1.0 / (10 ** (-(r_home + hfa - r_away) / 400) + 1.0)


def start_new_season(ratings: dict[str, float], new_teams: set[str], p: EloParams) -> dict[str, float]:
    """Pull every rating back towards 1500, drop relegated teams, add promoted ones."""
    pulled = {t: START_RATING + (1 - p.pull_back) * (r - START_RATING) for t, r in ratings.items()}
    relegated = set(pulled) - new_teams
    promoted = new_teams - set(pulled)
    start = (np.mean([pulled[t] for t in relegated]) if relegated else START_RATING) - p.promoted_offset
    out = {t: r for t, r in pulled.items() if t in new_teams}
    out.update({t: start for t in promoted})
    return out


def run_elo(matches: pd.DataFrame, p: EloParams) -> tuple[pd.DataFrame, dict[str, float]]:
    """Walk through the matches in date order.

    In: matches with season, date, home, away, home_goals, away_goals, match_id.
    Out: one row per played match with the pre-match ratings, and the ratings after the last match.
    """
    df = (matches.dropna(subset=["home_goals", "away_goals"])
          .sort_values(["date", "match_id"]).reset_index(drop=True))
    teams_by_season = {s: set(g["home"]) | set(g["away"]) for s, g in df.groupby("season")}
    seasons, dates = df["season"].to_numpy(), df["date"].to_numpy()
    homes, aways = df["home"].to_numpy(), df["away"].to_numpy()
    gds = (df["home_goals"] - df["away_goals"]).astype(int).to_numpy()
    mults = np.array([goal_multiplier(g, p.goal_mult) for g in gds])
    actuals = np.where(gds > 0, 1.0, np.where(gds == 0, 0.5, 0.0))
    pre_home, pre_away = np.empty(len(df)), np.empty(len(df))

    ratings: dict[str, float] = {}
    season = None
    day_starts = np.flatnonzero(np.r_[True, dates[1:] != dates[:-1]])
    day_ends = np.r_[day_starts[1:], len(df)]
    for start, end in zip(day_starts, day_ends):
        if seasons[start] != season:
            season = seasons[start]
            ratings = (start_new_season(ratings, teams_by_season[season], p) if ratings
                       else {t: START_RATING for t in teams_by_season[season]})
        # 1) record pre-match ratings for the whole day, 2) then apply the day's updates
        for i in range(start, end):
            pre_home[i], pre_away[i] = ratings[homes[i]], ratings[aways[i]]
        for i in range(start, end):
            delta = p.k * mults[i] * (actuals[i] - expected_home(pre_home[i], pre_away[i], p.hfa))
            ratings[homes[i]] += delta
            ratings[aways[i]] -= delta

    rated = df[["match_id", "season", "date", "home", "away", "home_goals", "away_goals"]].copy()
    rated["elo_home"], rated["elo_away"] = pre_home, pre_away
    rated["elo_diff"] = (rated["elo_home"] - rated["elo_away"]) / 100  # in 100s of points
    rated["result"] = pd.Categorical(
        np.select([rated["home_goals"] > rated["away_goals"], rated["home_goals"] == rated["away_goals"]],
                  ["home", "draw"], "away"), categories=ORDER, ordered=True)
    return rated, ratings


def fit_ordered_logit(train: pd.DataFrame):
    """Ordered logit of result (away < draw < home) on elo_diff. Returns the fitted results."""
    model = OrderedModel(train["result"], train[["elo_diff"]], distr="logit")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return model.fit(method="bfgs", disp=False, maxiter=200)


def predict_hda(fit, rows: pd.DataFrame) -> np.ndarray:
    """Fitted ordered logit + rows with elo_diff -> n x 3 array in home, draw, away order."""
    probs = np.asarray(fit.model.predict(fit.params, exog=rows[["elo_diff"]].to_numpy()))
    return probs[:, ::-1]  # categories are away, draw, home


def walk_forward(rated: pd.DataFrame, seasons: list[str]) -> dict[str, np.ndarray]:
    """For each season: fit the logit on all earlier seasons except the burn-in, predict that season."""
    out = {}
    for s in seasons:
        train = rated[(rated["season"] > BURN_IN_SEASON) & (rated["season"] < s)]
        out[s] = predict_hda(fit_ordered_logit(train), rated[rated["season"] == s])
    return out


def season_log_loss(probs: np.ndarray, rows: pd.DataFrame) -> float:
    idx = rows["result"].map({"home": 0, "draw": 1, "away": 2}).to_numpy()
    return float(-np.log(np.clip(probs[np.arange(len(idx)), idx], 1e-15, 1)).mean())


def tune(matches: pd.DataFrame) -> pd.DataFrame:
    """Score every grid point on 2016-17 to 2022-23, using only matches up to 2022-23."""
    train = matches[matches["season"] <= LAST_TUNING_SEASON]
    results = []
    keys = list(GRID)
    for values in itertools.product(*GRID.values()):
        p = EloParams(**dict(zip(keys, values)))
        rated, _ = run_elo(train, p)
        preds = walk_forward(rated, TUNING_SCORED_SEASONS)
        losses = [season_log_loss(preds[s], rated[rated["season"] == s]) for s in TUNING_SCORED_SEASONS]
        n = [int((rated["season"] == s).sum()) for s in TUNING_SCORED_SEASONS]
        results.append({**asdict(p), "log_loss": float(np.average(losses, weights=n))})
    return pd.DataFrame(results).sort_values("log_loss").reset_index(drop=True)


def backtest(matches: pd.DataFrame, p: EloParams) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, float]]:
    """Run Elo over all seasons, predict the backtest seasons walk-forward.

    Returns predictions in the standard format, the rated matches, and the latest ratings.
    """
    rated, ratings = run_elo(matches, p)
    preds = walk_forward(rated, BACKTEST_SEASONS)
    frames = [to_standard(rated.loc[rated["season"] == s, "match_id"], preds[s], MODEL, p.version())
              for s in BACKTEST_SEASONS]
    return pd.concat(frames, ignore_index=True), rated, ratings


def predict_fixtures(matches: pd.DataFrame, fixtures: pd.DataFrame,
                     p: EloParams = ACCEPTED) -> tuple[pd.DataFrame, dict[str, float]]:
    """Upcoming fixtures (match_id, season, home, away) -> standard rows and the ratings used.

    Ratings come from every played match. The ordered logit is fitted on all
    seasons before the fixtures' season (burn-in excluded).
    """
    if fixtures["season"].nunique() != 1:
        raise ValueError("fixtures must all be in one season")
    season = fixtures["season"].iloc[0]
    rated, ratings = run_elo(matches, p)
    if season not in set(rated["season"]):
        raise ValueError(f"no played matches in {season} yet; promoted teams have no rating")
    missing = sorted((set(fixtures["home"]) | set(fixtures["away"])) - set(ratings))
    if missing:
        raise ValueError(f"no Elo rating for {missing}")
    rows = fixtures.assign(elo_diff=(fixtures["home"].map(ratings) - fixtures["away"].map(ratings)) / 100)
    fit = fit_ordered_logit(rated[(rated["season"] > BURN_IN_SEASON) & (rated["season"] < season)])
    return to_standard(rows["match_id"], predict_hda(fit, rows), MODEL, p.version()), ratings


def main() -> None:
    matches = load_matches()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    n_grid = int(np.prod([len(v) for v in GRID.values()]))
    print(f"tuning {n_grid} settings on {TUNING_SCORED_SEASONS[0]}..{TUNING_SCORED_SEASONS[-1]} "
          f"(data up to {LAST_TUNING_SEASON} only, {BURN_IN_SEASON} burn-in)...")
    grid = tune(matches)
    grid.to_csv(OUT_DIR / "tuning.csv", index=False)
    print(grid.head(10).round(4).to_string(index=False))
    best = grid.iloc[0]
    p = EloParams(k=float(best["k"]), hfa=float(best["hfa"]), goal_mult=str(best["goal_mult"]),
                  pull_back=float(best["pull_back"]), promoted_offset=float(best["promoted_offset"]))
    print(f"\nchosen: {p.version()}")

    preds, rated, ratings = backtest(matches, p)
    save_backtest(preds, MODEL)

    # Ordered logit coefficients for each backtest season, for the STOP summary and the maths note.
    coefs = []
    for s in BACKTEST_SEASONS:
        fit = fit_ordered_logit(rated[(rated["season"] > BURN_IN_SEASON) & (rated["season"] < s)])
        cut1, log_gap = fit.params.iloc[1], fit.params.iloc[2]
        coefs.append({"season": s, "beta_elo_diff_per_100": fit.params.iloc[0],
                      "cut_away_draw": cut1, "cut_draw_home": cut1 + np.exp(log_gap),
                      "n_train": int(fit.nobs)})
    coefs = pd.DataFrame(coefs)
    coefs.to_csv(OUT_DIR / "logit_coefficients.csv", index=False)
    print("\nordered logit per backtest season (latent = beta x elo_diff/100):")
    print(coefs.round(4).to_string(index=False))

    last_date = rated["date"].max()
    current = (pd.Series(ratings, name="rating").rename_axis("team").reset_index()
               .sort_values("rating", ascending=False).reset_index(drop=True))
    current["as_of"] = last_date.date().isoformat()
    current.to_csv(OUT_DIR / "ratings_current.csv", index=False)
    print(f"\ncurrent ratings after {last_date.date()} ({len(current)} teams, mean {current['rating'].mean():.1f}):")
    print(current.head(5).round(1).to_string(index=False))
    print("...")
    print(current.tail(5).round(1).to_string(index=False))


if __name__ == "__main__":
    main()
