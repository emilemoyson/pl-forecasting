"""Scoreboard metrics on hand-made examples."""

import math

import numpy as np
import pandas as pd
import pytest

from src.evaluate.scoreboard import (
    accuracy, attach_results, brier, calibration_table, check_predictions, log_loss, outcome_index, score,
)

THIRD = np.full((3, 3), 1 / 3)
Y = np.array([0, 1, 2])  # home win, draw, away win


def test_certain_and_right_gives_zero():
    probs = np.eye(3)  # 100% on the actual result each time
    assert log_loss(probs, Y) == pytest.approx(0.0)
    assert brier(probs, Y) == pytest.approx(0.0)
    assert accuracy(probs, Y) == 1.0


def test_one_third_each():
    assert log_loss(THIRD, Y) == pytest.approx(math.log(3))  # 1.0986
    assert brier(THIRD, Y) == pytest.approx(2 / 3)  # (2/3)^2 + 2 * (1/3)^2


def test_certain_and_wrong_is_large_but_finite():
    probs = np.array([[0.0, 0.0, 1.0]])
    assert log_loss(probs, np.array([0])) == pytest.approx(-math.log(1e-15))
    assert brier(probs, np.array([0])) == pytest.approx(2.0)


def test_hand_computed_example():
    probs = np.array([[0.5, 0.3, 0.2], [0.2, 0.3, 0.5]])
    y = np.array([0, 1])  # first right (home), second a draw
    assert log_loss(probs, y) == pytest.approx(-(math.log(0.5) + math.log(0.3)) / 2)
    assert brier(probs, y) == pytest.approx(((0.25 + 0.09 + 0.04) + (0.04 + 0.49 + 0.25)) / 2)
    assert accuracy(probs, y) == 0.5


def test_outcome_index():
    out = outcome_index(pd.Series([2, 1, 0]), pd.Series([1, 1, 3]))
    assert list(out) == [0, 1, 2]


def _preds(rows):
    return pd.DataFrame(rows, columns=["match_id", "model", "model_version", "created_at_utc",
                                       "p_home", "p_draw", "p_away"])


def test_check_predictions_rejects_bad_sums():
    bad = _preds([["m1", "x", "v1", "2026-01-01T00:00:00Z", 0.5, 0.3, 0.3]])
    with pytest.raises(ValueError, match="sum to 1"):
        check_predictions(bad)


def test_check_predictions_rejects_missing_column():
    with pytest.raises(ValueError, match="missing columns"):
        check_predictions(_preds([["m1", "x", "v1", "t", 0.5, 0.3, 0.2]]).drop(columns="model_version"))


def test_score_end_to_end_skips_unplayed_matches():
    matches = pd.DataFrame({
        "match_id": ["a", "b", "c"], "season": ["2324"] * 3,
        "home_goals": pd.array([2, 0, pd.NA], dtype="Int64"), "away_goals": pd.array([0, 0, pd.NA], dtype="Int64"),
    })
    preds = _preds([
        ["a", "uniform", "v1", "t", 1 / 3, 1 / 3, 1 / 3],
        ["b", "uniform", "v1", "t", 1 / 3, 1 / 3, 1 / 3],
        ["c", "uniform", "v1", "t", 1 / 3, 1 / 3, 1 / 3],  # not played yet
    ])
    scored = attach_results(preds, matches)
    table = score(scored)
    assert table.loc[0, "n"] == 2
    assert table.loc[0, "log_loss"] == pytest.approx(math.log(3))


def test_calibration_bins_pool_all_outcomes():
    matches = pd.DataFrame({"match_id": ["a", "b"], "season": ["2324"] * 2,
                            "home_goals": [1, 0], "away_goals": [0, 1]})
    preds = _preds([["a", "m", "v1", "t", 0.55, 0.25, 0.20], ["b", "m", "v1", "t", 0.55, 0.25, 0.20]])
    calib = calibration_table(attach_results(preds, matches))
    assert calib["n"].sum() == 6  # 2 matches x 3 outcomes
    home_bin = calib[calib["bin"] == 5].iloc[0]
    assert home_bin["mean_pred"] == pytest.approx(0.55)
    assert home_bin["observed"] == pytest.approx(0.5)  # home won 1 of 2


def test_check_predictions_rejects_duplicates():
    row = ["m1", "x", "v1", "t", 0.5, 0.3, 0.2]
    with pytest.raises(ValueError, match="duplicate"):
        check_predictions(_preds([row, row]))


def test_versions_of_the_same_model_are_scored_separately():
    matches = pd.DataFrame({"match_id": ["a"], "season": ["2324"], "home_goals": [1], "away_goals": [0]})
    preds = _preds([["a", "m", "v1", "t", 1 / 3, 1 / 3, 1 / 3], ["a", "m", "v2", "t", 0.5, 0.3, 0.2]])
    scored = attach_results(preds, matches)
    table = score(scored).set_index("model_version")
    assert list(table["n"]) == [1, 1]
    assert table.loc["v1", "log_loss"] == pytest.approx(math.log(3))
    assert table.loc["v2", "log_loss"] == pytest.approx(-math.log(0.5))
    assert set(calibration_table(scored)["model_version"]) == {"v1", "v2"}
