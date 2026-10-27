"""Export one season of matches, predictions and model scores for the web dashboard.

Reads data/processed/matches.parquet, outputs/backtest/<model>.csv and
outputs/backtest/scores.csv. Writes web/data/season_<season>.json, which
web/scripts/seed.mjs loads into Postgres. The JSON is not committed
(it holds match data, see .gitignore).

Usage: python -m src.publish.export_web [--season 2526]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
MATCHES_PATH = ROOT_DIR / "data" / "processed" / "matches.parquet"
BACKTEST_DIR = ROOT_DIR / "outputs" / "backtest"
OUT_DIR = ROOT_DIR / "web" / "data"

MODELS = ["baseline", "elo", "poisson_goals", "poisson_xg", "market"]
MATCH_COLS = ["match_id", "date", "home", "away", "home_goals", "away_goals", "home_xg", "away_xg",
              "avg_close_h", "avg_close_d", "avg_close_a"]


def load_matches(season: str) -> pd.DataFrame:
    """Matches for one season with a result, sorted by date."""
    m = pd.read_parquet(MATCHES_PATH)
    s = m[(m["season"] == season) & m["home_goals"].notna()].sort_values(["date", "match_id"])
    out = s[MATCH_COLS].copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out["home_goals"] = out["home_goals"].astype(int)
    out["away_goals"] = out["away_goals"].astype(int)
    return out.reset_index(drop=True)


def load_predictions(season: str, match_ids: set) -> pd.DataFrame:
    """One row per (match, model) from the backtest files, for the season's matches only."""
    frames = []
    for model in MODELS:
        p = pd.read_csv(BACKTEST_DIR / f"{model}.csv")
        p = p[p["match_id"].str.startswith(season + "_") & p["match_id"].isin(match_ids)]
        frames.append(p[["match_id", "model", "model_version", "p_home", "p_draw", "p_away"]])
    return pd.concat(frames, ignore_index=True)


def load_scores(season: str) -> pd.DataFrame:
    """Scoreboard rows (log loss, Brier, accuracy) for the season."""
    s = pd.read_csv(BACKTEST_DIR / "scores.csv", dtype={"season": str})
    return s[s["season"] == season].reset_index(drop=True)


def sanity_checks(matches: pd.DataFrame, preds: pd.DataFrame, scores: pd.DataFrame) -> None:
    """Print row counts and ranges; raise on anything that would break the dashboard."""
    print(f"matches: {len(matches)} rows, {matches['date'].min()} to {matches['date'].max()}")
    print(f"teams: {matches['home'].nunique()}")
    print(f"missing values in matches: {int(matches.isna().sum().sum())}")
    print(f"goals per match: {(matches['home_goals'] + matches['away_goals']).mean():.3f}")
    print(f"predictions: {len(preds)} rows, by model: {preds['model'].value_counts().to_dict()}")
    print(f"scores: {len(scores)} rows")
    if matches["match_id"].duplicated().any():
        raise ValueError("duplicate match_id in matches")
    sums = preds[["p_home", "p_draw", "p_away"]].sum(axis=1)
    if not np.allclose(sums, 1.0, atol=1e-3):
        raise ValueError("prediction probabilities do not sum to 1")
    if (preds.groupby("model").size() != len(matches)).any():
        raise ValueError("a model is missing predictions for some matches")
    print("probabilities sum to 1: ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2526")
    args = parser.parse_args()

    matches = load_matches(args.season)
    preds = load_predictions(args.season, set(matches["match_id"]))
    scores = load_scores(args.season)
    sanity_checks(matches, preds, scores)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"season_{args.season}.json"
    payload = {
        "season": args.season,
        "matches": matches.to_dict(orient="records"),
        "predictions": preds.to_dict(orient="records"),
        "scores": scores.to_dict(orient="records"),
    }
    out_path.write_text(json.dumps(payload))
    print(f"wrote {out_path.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()
