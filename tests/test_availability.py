"""Baseline start probabilities on a hand-made FPL file."""

import pandas as pd
import pytest

from src.features.availability import baseline_start_probs, check_next_round


def _bootstrap(next_event=6):
    teams = [{"id": 1, "name": "Arsenal"}, {"id": 2, "name": "Leeds"}, {"id": 3, "name": "Spurs"}]
    def player(pid, team, starts, chance, status="a"):
        return {"id": pid, "web_name": f"P{pid}", "first_name": "F", "second_name": f"S{pid}", "team": team,
                "element_type": 3, "status": status, "chance_of_playing_next_round": chance,
                "news": "", "minutes": starts * 90, "starts": starts}
    elements = [player(1, 1, 5, None), player(2, 1, 4, 75.0, "d"), player(3, 1, 2, 0.0, "i"),
                player(4, 2, 6, None),  # moved clubs: more starts than Leeds has matches
                player(5, 3, 5, None)]  # Spurs not playing this matchweek
    events = [{"id": 5, "is_next": next_event == 5}, {"id": 6, "is_next": next_event == 6}]
    return {"teams": teams, "elements": elements, "events": events}


FIXTURES = pd.DataFrame({
    "event": [4, 5, 5, 6],
    "home": ["Arsenal", "Leeds", "Spurs", "Arsenal"],
    "away": ["Spurs", "Arsenal", "Leeds", "Leeds"],
    "finished": [True, True, True, False],
    "started": [True, True, True, False],
})


def test_formula_and_scope():
    out = baseline_start_probs(_bootstrap(), FIXTURES, 6).set_index("fpl_id")
    assert set(out.index) == {1, 2, 3, 4}  # Spurs players excluded
    assert out.loc[1, "team_matches"] == 2  # Arsenal played 2 finished matches before MW6
    assert out.loc[1, "p_start_baseline"] == pytest.approx(1.0)  # 5/2 clipped to 1, chance empty -> 100
    assert out.loc[2, "p_start_baseline"] == pytest.approx(0.75)  # min(4/2, 1) * 0.75
    assert out.loc[3, "p_start_baseline"] == 0  # ruled out
    assert out.loc[4, "p_start_baseline"] == pytest.approx(1.0)  # 6/2 clipped
    assert out.loc[1, "opponent"] == "Leeds" and out.loc[1, "venue"] == "H"


def test_start_share_uses_only_earlier_finished_matches():
    fx = pd.concat([FIXTURES, pd.DataFrame({"event": [6], "home": ["Spurs"], "away": ["Leeds"],
                                            "finished": [True], "started": [True]})], ignore_index=True)
    out = baseline_start_probs(_bootstrap(), fx, 6).set_index("fpl_id")
    assert out.loc[4, "team_matches"] == 2  # the MW6 result is not counted


def test_next_round_must_be_the_matchweek():
    check_next_round(_bootstrap(6), 6)
    with pytest.raises(RuntimeError, match="next gameweek"):
        check_next_round(_bootstrap(5), 6)
