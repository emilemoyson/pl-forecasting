"""Score every backtest predictions file in outputs/backtest/ on the same matches.

Reads outputs/backtest/<model>.csv (standard format), scores each model
per season and overall, and writes outputs/backtest/scores.csv and
outputs/backtest/calibration.png.

Usage: python -m src.evaluate.backtest
"""

from __future__ import annotations

import pandas as pd

from src.evaluate.scoreboard import (
    attach_results, calibration_table, check_predictions, plot_calibration, score,
)
from src.models.common import BACKTEST_DIR, ROOT_DIR, load_matches

SCORE_FILES = {"scores.csv"}


def load_backtests() -> pd.DataFrame:
    """Concatenate all predictions files in outputs/backtest/ and check the format."""
    paths = sorted(p for p in BACKTEST_DIR.glob("*.csv") if p.name not in SCORE_FILES)
    if not paths:
        raise FileNotFoundError(f"no predictions in {BACKTEST_DIR}")
    preds = pd.concat([pd.read_csv(p, dtype={"match_id": str}) for p in paths], ignore_index=True)
    check_predictions(preds)
    return preds


def main() -> None:
    preds = load_backtests()
    scored = attach_results(preds, load_matches())

    # Every model must be scored on exactly the same matches, or the comparison is unfair.
    match_sets = scored.groupby(["model", "model_version"])["match_id"].apply(frozenset)
    if match_sets.nunique() != 1:
        raise ValueError(f"models cover different matches: {match_sets.apply(len).to_dict()}")

    per_season = score(scored, ["model", "model_version", "season"])
    overall = score(scored).assign(season="all")
    table = pd.concat([per_season, overall], ignore_index=True)
    table = table.sort_values(["season", "log_loss"]).reset_index(drop=True)

    print(f"scored {scored['match_id'].nunique()} matches, models: {sorted(scored['model'].unique())}\n")
    print(table.round(4).to_string(index=False))

    out_csv = BACKTEST_DIR / "scores.csv"
    table.to_csv(out_csv, index=False)
    chart = plot_calibration(calibration_table(scored), BACKTEST_DIR / "calibration.png",
                             title="Calibration, backtest 2023-24 to 2025-26")
    print(f"\nsaved {out_csv.relative_to(ROOT_DIR)} and {chart.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()
