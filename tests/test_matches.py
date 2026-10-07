"""Checks on the master matches table (data/processed/matches.parquet)."""

import pandas as pd
import pytest

from src.clean.build_matches import (
    COLUMNS, CURRENT_SEASON, OUT_PATH, join_sources, load_football_data, load_understat,
)


@pytest.fixture(scope="module")
def matches() -> pd.DataFrame:
    if not OUT_PATH.exists():
        pytest.skip("matches.parquet not built; run python -m src.clean.build_matches")
    return pd.read_parquet(OUT_PATH)


def test_columns(matches):
    assert list(matches.columns) == COLUMNS


def test_match_id_unique(matches):
    assert matches["match_id"].is_unique


def test_completed_seasons_have_380_matches(matches):
    counts = matches.groupby("season").size()
    completed = counts.drop(CURRENT_SEASON, errors="ignore")
    assert len(completed) == 12, f"expected 12 completed seasons, got {list(completed.index)}"
    assert (completed == 380).all(), completed[completed != 380].to_dict()


def test_no_missing_xg_or_goals(matches):
    for col in ["home_xg", "away_xg", "home_goals", "away_goals"]:
        assert matches[col].notna().all(), f"missing {col}"


def test_every_match_found_its_partner():
    try:
        fd, us = load_football_data(), load_understat()
    except ValueError as e:  # pd.concat of no files
        pytest.skip(f"raw files missing: {e}")
    merged = join_sources(fd, us)
    unmatched = merged[merged["_merge"] != "both"]
    assert unmatched.empty, unmatched[["season", "home", "away", "_merge"]].to_string()
