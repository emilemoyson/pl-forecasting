"""Poisson engine: matches statsmodels, grid maths, Dixon-Coles, priors, no leakage."""

import numpy as np
import pandas as pd
import pytest
import statsmodels.api as sm
import statsmodels.formula.api as smf

from src.models import poisson_core as pc
from src.models.common import MATCHES_PATH


@pytest.fixture(scope="module")
def matches():
    if not MATCHES_PATH.exists():
        pytest.skip("matches.parquet not built")
    return pd.read_parquet(MATCHES_PATH)


def test_unpenalised_fit_matches_statsmodels_glm(matches):
    tr = matches[matches["season"] == "2223"]
    p = pc.PoissonParams(ridge=0.0)
    f = pc.fit(tr, p, tr["date"].max(), [])
    lf = pc.long_format(tr, p, tr["date"].max())
    g = smf.glm("y ~ home + C(team) + C(opp)", data=lf, family=sm.families.Poisson()).fit()
    mine = np.exp(f.c + f.h * lf["home"] + lf["team"].map(f.att) + lf["opp"].map(f.dfn))
    assert np.abs(g.predict(lf) - mine).max() < 1e-3
    assert f.h == pytest.approx(g.params["home"], abs=1e-3)


def test_hda_from_rates_by_hand():
    p = pc.hda_from_rates(np.array([1.5, 1.2]), np.array([1.5, 0.0001]))
    assert p.sum(axis=1) == pytest.approx([1, 1])
    assert p[0, 0] == pytest.approx(p[0, 2])  # equal rates: home win = away win
    # away side never scores: draw = P(home 0) = exp(-1.2), home win = 1 - exp(-1.2)
    assert p[1, 1] == pytest.approx(np.exp(-1.2), abs=1e-3)
    assert p[1, 0] == pytest.approx(1 - np.exp(-1.2), abs=1e-3)


def test_dixon_coles_moves_mass_to_draws():
    base = pc.hda_from_rates(np.array([1.3]), np.array([1.1]))
    dc = pc.hda_from_rates(np.array([1.3]), np.array([1.1]), rho=-0.1)
    assert dc[0, 1] > base[0, 1]  # negative rho: more 0-0 and 1-1
    assert dc.sum() == pytest.approx(1)
    tau = pc.dc_tau(np.array([0, 0, 1, 1, 2]), np.array([0, 1, 0, 1, 2]), np.full(5, 1.3), np.full(5, 1.1), 0.1)
    assert tau == pytest.approx([1 - 1.3 * 1.1 * 0.1, 1 + 1.3 * 0.1, 1 + 1.1 * 0.1, 0.9, 1.0])


def test_team_without_data_sits_at_its_prior(matches):
    tr = matches[matches["season"] == "2223"]
    f = pc.fit(tr, pc.PoissonParams(), tr["date"].max(), ["Newcomer"], prior={"Newcomer": (-0.2, 0.15)})
    assert f.att["Newcomer"] == pytest.approx(-0.2, abs=1e-4)
    assert f.dfn["Newcomer"] == pytest.approx(0.15, abs=1e-4)


def test_walk_forward_ignores_same_block_and_future_results(matches):
    m = matches[matches["season"].isin(["2122", "2223"])].copy()
    p = pc.PoissonParams()
    before = pc.walk_forward(m, ["2223"], p).set_index("match_id")
    blocks = pc.weekly_block(m["date"])
    cut = sorted(blocks[m["season"] == "2223"].unique())[10]  # the 11th week of 2022-23
    changed = m.copy()
    changed.loc[blocks >= cut, ["home_goals", "away_goals"]] = [5, 0]  # rewrite that week and after
    after = pc.walk_forward(changed, ["2223"], p).set_index("match_id")
    upto = m.loc[(blocks <= cut) & (m["season"] == "2223"), "match_id"]
    cols = ["p_home", "p_draw", "p_away"]
    pd.testing.assert_frame_equal(before.loc[upto, cols], after.loc[upto, cols])
    assert not before[cols].equals(after[cols])  # later weeks do change


def test_promoted_prior_relegated_average(matches):
    p = pc.PoissonParams(promoted_prior="relegated")
    prior = pc.promoted_prior(matches, "2526", p)
    assert set(prior) == {"Leeds", "Burnley", "Sunderland"}
    assert pc.promoted_prior(matches, "2526", pc.PoissonParams(promoted_prior="average")) == {}


def test_xg_blend_and_time_decay_weights():
    m = pd.DataFrame({"date": pd.to_datetime(["2024-01-01", "2023-01-01"]), "home": ["A", "B"], "away": ["B", "A"],
                      "home_goals": [2, 0], "away_goals": [0, 1], "home_xg": [1.0, 0.4], "away_xg": [0.6, 1.2]})
    p = pc.PoissonParams(xg_weight=0.75, half_life_days=365)
    lf = pc.long_format(m, p, pd.Timestamp("2024-01-01"))
    assert lf["y"].tolist() == pytest.approx([0.75 * 1.0 + 0.25 * 2, 0.75 * 0.4, 0.75 * 0.6, 0.75 * 1.2 + 0.25])
    assert lf["w"].tolist() == pytest.approx([1.0, 0.5, 1.0, 0.5])  # one half-life older -> half weight


def test_poisson_xg_tuning_never_sees_backtest_seasons():
    from src.models import poisson_xg
    assert max(poisson_xg.TUNING_SEASONS) < "2324"
    assert poisson_xg.FIXED["promoted_prior"] == "relegated"  # D2


def test_accepted_live_settings_match_the_backtest_files():
    from src.models import poisson_goals, poisson_xg
    from src.models.common import BACKTEST_DIR
    for module in [poisson_goals, poisson_xg]:
        path = BACKTEST_DIR / f"{module.MODEL}.csv"
        if not path.exists():
            pytest.skip("backtest files not built")
        versions = set(pd.read_csv(path)["model_version"])
        assert versions == {module.ACCEPTED.version(module.MODEL)}
