"""Baseline: league-average home / draw / away frequencies.

For each predicted season, the probabilities are the share of home wins,
draws and away wins over all seasons before it (from 2014-15). Every
match in that season gets the same three numbers. No information from
the predicted season is used.

Usage: python -m src.models.baseline
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.models.common import BACKTEST_SEASONS, load_matches, save_backtest, to_standard

MODEL = "baseline"
VERSION = "prior_seasons_v1"


def outcome_shares(matches: pd.DataFrame) -> np.ndarray:
    """Played matches -> [share home wins, share draws, share away wins]."""
    hg, ag = matches["home_goals"], matches["away_goals"]
    return np.array([(hg > ag).mean(), (hg == ag).mean(), (hg < ag).mean()])


def predict_season(matches: pd.DataFrame, season: str) -> pd.DataFrame:
    """Predict every match of `season` from the frequencies of all earlier seasons."""
    history = matches[(matches["season"] < season)].dropna(subset=["home_goals", "away_goals"])
    if history.empty:
        raise ValueError(f"no seasons before {season}")
    target = matches[matches["season"] == season]
    probs = np.tile(outcome_shares(history), (len(target), 1))
    return to_standard(target["match_id"], probs, MODEL, VERSION)


def predict_fixtures(matches: pd.DataFrame, fixtures: pd.DataFrame) -> pd.DataFrame:
    """Upcoming fixtures (match_id, season) -> standard rows from all earlier seasons' frequencies."""
    if fixtures["season"].nunique() != 1:
        raise ValueError("fixtures must all be in one season")
    season = fixtures["season"].iloc[0]
    history = matches[matches["season"] < season].dropna(subset=["home_goals", "away_goals"])
    probs = np.tile(outcome_shares(history), (len(fixtures), 1))
    return to_standard(fixtures["match_id"], probs, MODEL, VERSION)


def main() -> None:
    matches = load_matches()
    preds = pd.concat([predict_season(matches, s) for s in BACKTEST_SEASONS], ignore_index=True)
    save_backtest(preds, MODEL)
    print("\nbaseline probabilities per season (from all earlier seasons):")
    for s in BACKTEST_SEASONS:
        hist = matches[matches["season"] < s]
        h, d, a = outcome_shares(hist)
        print(f"  {s}: trained on {hist['season'].min()}..{hist['season'].max()} ({len(hist)} matches) "
              f"-> H {h:.3f}  D {d:.3f}  A {a:.3f}")


if __name__ == "__main__":
    main()
