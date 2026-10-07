"""Market and baseline models: margin removal, probability sums, no leakage."""

import numpy as np
import pandas as pd
import pytest

from src.models import baseline, market


def test_remove_margin_example():
    odds = pd.DataFrame({"h": [2.0], "d": [4.0], "a": [4.0]})  # implied 0.5 + 0.25 + 0.25 = 1.0
    assert market.remove_margin(market.implied(odds))[0] == pytest.approx([0.5, 0.25, 0.25])
    odds = pd.DataFrame({"h": [1.9], "d": [3.6], "a": [4.2]})  # overround about 5%
    raw = market.implied(odds)
    assert raw.sum() > 1.04
    p = market.remove_margin(raw)[0]
    assert p.sum() == pytest.approx(1.0)
    assert p == pytest.approx(raw[0] / raw.sum())  # proportional: ratios unchanged


def test_market_raises_on_missing_odds():
    m = pd.DataFrame({"match_id": ["x"], "avg_close_h": [2.0], "avg_close_d": [np.nan], "avg_close_a": [3.0]})
    with pytest.raises(ValueError, match="missing closing odds"):
        market.predict(m)


def _toy_matches():
    rows = []
    for season, results in {"1415": [(1, 0), (0, 0), (0, 1), (2, 1)], "1516": [(0, 0), (3, 0)],
                            "1617": [(0, 1), (0, 2), (1, 1)]}.items():
        for i, (hg, ag) in enumerate(results):
            rows.append({"match_id": f"{season}_{i}", "season": season, "home_goals": hg, "away_goals": ag})
    return pd.DataFrame(rows)


def test_baseline_uses_only_earlier_seasons():
    m = _toy_matches()
    preds = baseline.predict_season(m, "1617")
    # 6 earlier matches: 3 home wins, 2 draws, 1 away win
    assert preds[["p_home", "p_draw", "p_away"]].iloc[0].tolist() == pytest.approx([3 / 6, 2 / 6, 1 / 6])
    assert len(preds) == 3


def test_baseline_ignores_the_predicted_season_and_later():
    m = _toy_matches()
    before = baseline.predict_season(m, "1516")
    changed = m.copy()
    changed.loc[changed["season"] >= "1516", ["home_goals", "away_goals"]] = [0, 5]  # rewrite the future
    after = baseline.predict_season(changed, "1516")
    pd.testing.assert_frame_equal(before.drop(columns="created_at_utc"), after.drop(columns="created_at_utc"))
