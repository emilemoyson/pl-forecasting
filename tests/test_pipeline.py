"""Live pipeline: UK time to UTC, odds parsing, market rows, timestamp and kickoff guards."""

from pathlib import Path

import pandas as pd
import pytest

from src import pipeline
from src.clean.times import uk_local_to_utc
from src.models.common import ROOT_DIR

E0_CURRENT = ROOT_DIR / "data" / "raw" / "football_data" / "E0_2627.csv"
FPL_FIXTURES = ROOT_DIR / "data" / "raw" / "fpl" / "fixtures.json"


def test_uk_local_to_utc_summer_and_winter():
    out = uk_local_to_utc(pd.Series(["10/10/2026", "07/11/2026"]), pd.Series(["12:30", "15:00"]))
    assert list(out.dt.strftime("%Y-%m-%d %H:%M")) == ["2026-10-10 11:30", "2026-11-07 15:00"]  # BST, GMT
    assert str(out.dt.tz) == "UTC"


@pytest.fixture(scope="module")
def fpl():
    if not FPL_FIXTURES.exists():
        pytest.skip("no FPL raw file")
    return pipeline.fpl_fixtures()


def test_football_data_kickoffs_match_fpl_after_conversion(fpl):
    """Every played 2026-27 match: football-data time converted to UTC equals the FPL kickoff."""
    if not E0_CURRENT.exists():
        pytest.skip("no football-data raw file")
    odds = pipeline.parse_fixtures_odds(E0_CURRENT)  # season file has the same layout as fixtures.csv
    joined = odds.merge(fpl[["match_id", "kickoff_utc"]], on="match_id", how="left")
    assert joined["kickoff_utc"].notna().all(), "some football-data matches not found in FPL"
    assert (joined["fd_kickoff_utc"] == joined["kickoff_utc"]).all()


def test_market_rows_replay_matchweek_5(fpl, tmp_path):
    """Replay MW5 through the market path, as if its odds were the Friday file."""
    if not E0_CURRENT.exists():
        pytest.skip("no football-data raw file")
    mw5 = fpl[fpl["event"] == 5][["match_id", "season", "home", "away", "kickoff_utc"]]
    odds = pipeline.parse_fixtures_odds(E0_CURRENT)
    collected = "2026-09-18T17:00:00Z"
    rows = pipeline.market_rows(mw5, odds, collected, Path("fixtures_test.csv"))
    assert len(rows) == 10
    assert set(rows["match_id"]) == set(mw5["match_id"])
    assert (rows["created_at_utc"] == collected).all()
    assert rows[pipeline.PROB_COLS].sum(axis=1).sub(1).abs().max() < 1e-12
    raw = 1 / rows[["avg_h", "avg_d", "avg_a"]].to_numpy()
    assert rows[pipeline.PROB_COLS].to_numpy() == pytest.approx(raw / raw.sum(axis=1, keepdims=True))
    pipeline.check_rows(rows, 10, "replay")
    with pytest.raises(ValueError, match="expected 11"):
        pipeline.check_rows(rows, 11, "replay")
    pipeline.check_rows(rows, 11, "replay", strict_count=False)


def test_parse_fixtures_handles_bom_and_other_leagues(tmp_path):
    p = tmp_path / "fixtures.csv"
    p.write_text("Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,AvgH,AvgD,AvgA,MaxH,MaxD,MaxA\n"
                 "E0,10/10/2026,12:30,Arsenal,Leeds,1.4,4.8,8.0,1.42,4.7,7.6,1.45,5.0,8.5\n"
                 "E1,10/10/2026,15:00,Hull,Stoke,2.0,3.4,3.6,2.0,3.4,3.6,2.1,3.5,3.8\n", encoding="utf-8-sig")
    out = pipeline.parse_fixtures_odds(p)
    assert list(out["match_id"]) == ["2627_arsenal_leeds"]
    assert out["fd_kickoff_utc"].iloc[0] == pd.Timestamp("2026-10-10 11:30", tz="UTC")


def test_unmapped_team_in_odds_file_raises(tmp_path):
    p = tmp_path / "fixtures.csv"
    p.write_text("Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A,AvgH,AvgD,AvgA,MaxH,MaxD,MaxA\n"
                 "E0,10/10/2026,12:30,Arsenal,Real Madrid,1,1,1,1,1,1,1,1,1\n")
    with pytest.raises(ValueError, match="Unmapped"):
        pipeline.parse_fixtures_odds(p)


def _rows(created, kickoff):
    return pd.DataFrame({"match_id": ["m"], "model": ["x"], "model_version": ["v"], "created_at_utc": [created],
                         "p_home": [0.5], "p_draw": [0.3], "p_away": [0.2], "kickoff_utc": [kickoff]})


def test_check_rows_rejects_timestamp_at_or_after_kickoff():
    pipeline.check_rows(_rows("2026-10-10T11:29:59Z", "2026-10-10T11:30:00Z"), 1, "ok")
    for created in ["2026-10-10T11:30:00Z", "2026-10-10T12:00:00Z"]:
        with pytest.raises(ValueError, match="at or after kickoff"):
            pipeline.check_rows(_rows(created, "2026-10-10T11:30:00Z"), 1, "late")


def test_matchweek_fixtures_refuses_started_matches(fpl):
    with pytest.raises(RuntimeError, match="already has started"):
        pipeline.matchweek_fixtures(fpl, 5, pd.Timestamp.now(tz="UTC"))
    before_mw5 = pd.Timestamp("2026-09-01", tz="UTC")
    assert len(pipeline.matchweek_fixtures(fpl.assign(started=False), 5, before_mw5)) == 10


def test_stale_data_check_uses_kickoff_time_too(fpl):
    matches = pd.read_parquet(ROOT_DIR / "data" / "processed" / "matches.parquet")
    now = pd.Timestamp("2026-10-13", tz="UTC")  # after MW6, which is not in matches.parquet
    with pytest.raises(RuntimeError, match="missing from matches.parquet"):
        pipeline.check_no_missing_results(fpl.assign(finished=False), matches, now)
