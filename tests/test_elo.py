"""Elo: update maths, season rules, and no use of future matches."""

import numpy as np
import pandas as pd
import pytest

from src.models.elo import (
    START_RATING, EloParams, expected_home, goal_multiplier, run_elo, start_new_season,
)


def _m(rows):
    """rows: (season, date, home, away, hg, ag)"""
    df = pd.DataFrame(rows, columns=["season", "date", "home", "away", "home_goals", "away_goals"])
    df["date"] = pd.to_datetime(df["date"])
    df["match_id"] = df["season"] + "_" + df["home"] + "_" + df["away"]
    return df


TOY = _m([
    ("1415", "2014-08-16", "A", "B", 2, 0), ("1415", "2014-08-16", "C", "D", 1, 1),
    ("1415", "2014-08-23", "B", "C", 0, 3), ("1415", "2014-08-23", "D", "A", 1, 0),
    ("1516", "2015-08-08", "A", "E", 4, 0), ("1516", "2015-08-08", "C", "B", 0, 1),
])


def test_expected_score_and_goal_multiplier():
    assert expected_home(1500, 1500, 0) == pytest.approx(0.5)
    assert expected_home(1500, 1500, 100) == pytest.approx(1 / (10 ** (-0.25) + 1))
    assert expected_home(1600, 1500, 0) + expected_home(1500, 1600, 0) == pytest.approx(1)
    assert [goal_multiplier(g, "sqrt") for g in [0, 1, -1, 2, 4]] == pytest.approx([1, 1, 1, np.sqrt(2), 2])
    assert [goal_multiplier(g, "index") for g in [1, 2, 3, 5]] == pytest.approx([1, 1.5, 1.75, 2.0])
    assert goal_multiplier(5, "none") == 1


def test_first_match_update_by_hand():
    p = EloParams(k=20, hfa=0, goal_mult="sqrt", pull_back=0, promoted_offset=0)
    rated, ratings = run_elo(TOY[TOY["season"] == "1415"].head(1), p)
    # A beats B 2-0 from 1500 each: delta = 20 * sqrt(2) * (1 - 0.5)
    assert ratings["A"] == pytest.approx(1500 + 10 * np.sqrt(2))
    assert ratings["B"] == pytest.approx(1500 - 10 * np.sqrt(2))
    assert rated["elo_home"].iloc[0] == START_RATING


def test_ratings_are_zero_sum_within_a_season():
    rated, ratings = run_elo(TOY[TOY["season"] == "1415"], EloParams())
    assert np.mean(list(ratings.values())) == pytest.approx(START_RATING)


def test_new_season_pull_back_and_promotion():
    p = EloParams(pull_back=0.5, promoted_offset=10)
    out = start_new_season({"A": 1600, "B": 1400, "C": 1520}, {"A", "C", "E"}, p)
    assert out["A"] == pytest.approx(1550)  # halfway back to 1500
    assert out["C"] == pytest.approx(1510)
    assert out["E"] == pytest.approx(1450 - 10)  # relegated B after pull-back, minus offset
    assert "B" not in out


def test_pre_match_ratings_ignore_same_day_and_future_results():
    p = EloParams()
    rated, _ = run_elo(TOY, p)
    changed = TOY.copy()
    later = changed["date"] >= "2014-08-23"
    changed.loc[later, ["home_goals", "away_goals"]] = [7, 0]  # rewrite every result from 23 Aug on
    rated2, _ = run_elo(changed, p)
    cols = ["match_id", "elo_home", "elo_away"]
    # Ratings going INTO the 23 Aug matches must not change: they only depend on 16 Aug.
    pd.testing.assert_frame_equal(
        rated.loc[rated["date"] <= "2014-08-23", cols].reset_index(drop=True),
        rated2.loc[rated2["date"] <= "2014-08-23", cols].reset_index(drop=True))
    # Same-day matches: the C v D result on 16 Aug does not move A v B's pre-match ratings.
    first_day = rated[rated["date"] == "2014-08-16"]
    assert (first_day[["elo_home", "elo_away"]] == START_RATING).all().all()


def test_unplayed_matches_are_skipped():
    m = pd.concat([TOY, _m([("1516", "2015-08-15", "A", "C", None, None)])], ignore_index=True)
    rated, _ = run_elo(m, EloParams())
    assert len(rated) == len(TOY)
