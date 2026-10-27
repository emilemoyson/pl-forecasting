"""Checks on the web dashboard export (src/publish/export_web.py) for 2025-26."""

import numpy as np
import pandas as pd
import pytest

from src.publish import export_web

pytestmark = pytest.mark.skipif(not export_web.MATCHES_PATH.exists(), reason="processed data not built")


@pytest.fixture(scope="module")
def tables():
    return export_web.build("2526")


def test_full_season_with_no_gaps(tables):
    m = tables["matches"]
    assert len(m) == 380
    assert m["match_id"].is_unique
    assert not m.isna().any().any()


def test_every_club_has_a_location_and_badge(tables):
    clubs = tables["clubs"]
    assert set(clubs["canonical"]) == set(tables["matches"]["home"])
    assert clubs["lat"].between(49.9, 58.7).all() and clubs["lon"].between(-8.2, 1.8).all()
    assert clubs["badge_code"].notna().all() and clubs["badge_code"].is_unique


def test_probabilities_sum_to_one(tables):
    sums = tables["predictions"][["p_home", "p_draw", "p_away"]].sum(axis=1)
    assert np.allclose(sums, 1.0, atol=1e-3)


def test_log_loss_matches_scoreboard(tables):
    m, scores = tables["matches"], tables["scores"].set_index("model")
    assert m["ll_market"].mean() == pytest.approx(scores.loc["market", "log_loss"], abs=1e-9)
    assert m["ll_model"].mean() == pytest.approx(scores.loc["poisson_xg", "log_loss"], abs=1e-9)


def test_calibration_covers_every_probability(tables):
    cal = tables["calibration"]
    assert (cal.groupby("model")["n"].sum() == 3 * 380).all()
    assert cal["observed"].between(0, 1).all()


def test_scoreline_totals(tables):
    sl = tables["scorelines"]
    assert sl["actual"].sum() == 380
    assert sl["expected"].sum() == pytest.approx(380)
