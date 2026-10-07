"""Market benchmark: bookmaker odds turned into H/D/A probabilities.

Uses market average closing odds (avg_close_h/d/a). Implied probability
is 1 / decimal odds; the three add up to a bit more than 1 (the margin,
or overround). Proportional normalisation divides each by their sum.
This is the benchmark, never a model input.

Usage: python -m src.models.market
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.models.common import BACKTEST_SEASONS, load_matches, save_backtest, to_standard

MODEL = "market"
VERSION = "avg_close_prop_v1"
ODDS = ["avg_close_h", "avg_close_d", "avg_close_a"]


def implied(odds: pd.DataFrame) -> np.ndarray:
    """Decimal odds (n x 3) -> raw implied probabilities 1 / odds, margin still included."""
    return 1.0 / odds.to_numpy(dtype=float)


def remove_margin(raw: np.ndarray) -> np.ndarray:
    """Proportional normalisation: divide each implied probability by the row sum."""
    return raw / raw.sum(axis=1, keepdims=True)


def predict(matches: pd.DataFrame) -> pd.DataFrame:
    """Matches with avg closing odds -> standard prediction rows. Raises if any odds are missing."""
    if matches[ODDS].isna().any().any():
        raise ValueError(f"missing closing odds for {int(matches[ODDS].isna().any(axis=1).sum())} matches")
    probs = remove_margin(implied(matches[ODDS]))
    return to_standard(matches["match_id"], probs, MODEL, VERSION)


def margin_by_season(matches: pd.DataFrame) -> pd.DataFrame:
    """Average bookmaker margin (sum of implied probabilities minus 1) per season."""
    over = implied(matches[ODDS]).sum(axis=1) - 1
    return (pd.DataFrame({"season": matches["season"].to_numpy(), "margin": over})
            .groupby("season")["margin"].agg(["mean", "min", "max"]).reset_index())


def main() -> None:
    matches = load_matches()
    bt = matches[matches["season"].isin(BACKTEST_SEASONS)]
    save_backtest(predict(bt), MODEL)
    print("\nmarket margin (overround) per season:")
    print(margin_by_season(bt).round(4).to_string(index=False))


if __name__ == "__main__":
    main()
