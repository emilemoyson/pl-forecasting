"""Helpers shared by every model: the standard prediction format and the backtest seasons."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
MATCHES_PATH = ROOT_DIR / "data" / "processed" / "matches.parquet"
BACKTEST_DIR = ROOT_DIR / "outputs" / "backtest"

BACKTEST_SEASONS = ["2324", "2425", "2526"]
PRED_COLS = ["match_id", "model", "model_version", "created_at_utc", "p_home", "p_draw", "p_away"]
PROB_COLS = ["p_home", "p_draw", "p_away"]


def utc_now() -> str:
    """Current time as an ISO 8601 UTC string, e.g. 2026-10-07T18:30:00Z."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_matches() -> pd.DataFrame:
    return pd.read_parquet(MATCHES_PATH)


def to_standard(match_ids: pd.Series, probs: np.ndarray, model: str, version: str) -> pd.DataFrame:
    """Build rows in the standard prediction format and check each row sums to 1."""
    out = pd.DataFrame(probs, columns=PROB_COLS)
    out.insert(0, "match_id", match_ids.to_numpy())
    out.insert(1, "model", model)
    out.insert(2, "model_version", version)
    out.insert(3, "created_at_utc", utc_now())
    sums = out[PROB_COLS].sum(axis=1)
    if ((sums - 1).abs() > 1e-9).any() or out[PROB_COLS].isna().any().any():
        raise ValueError(f"{model}: probabilities missing or not summing to 1")
    return out[PRED_COLS]


def save_backtest(preds: pd.DataFrame, name: str) -> Path:
    """Write a backtest predictions file to outputs/backtest/<name>.csv and print sanity checks."""
    BACKTEST_DIR.mkdir(parents=True, exist_ok=True)
    path = BACKTEST_DIR / f"{name}.csv"
    preds.to_csv(path, index=False)
    sums = preds[PROB_COLS].sum(axis=1)
    print(f"{name}: {len(preds)} rows, unique match_id {preds['match_id'].is_unique}, "
          f"missing {int(preds[PROB_COLS].isna().sum().sum())}, "
          f"p range [{preds[PROB_COLS].min().min():.3f}, {preds[PROB_COLS].max().max():.3f}], "
          f"max |sum - 1| {(sums - 1).abs().max():.1e}")
    print(f"saved {path.relative_to(ROOT_DIR)}")
    return path
