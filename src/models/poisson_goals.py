"""Poisson GLM on goals: goals ~ home + attack(team) + defence(opponent).

Refit every week on past matches only (see poisson_core). Training
window, ridge strength and the promoted-team prior (decision D2) are
chosen on 2016-17 to 2022-23 only, then frozen for the backtest.

Usage: python -m src.models.poisson_goals
"""

from __future__ import annotations

import itertools
from dataclasses import asdict

import pandas as pd

from src.models import poisson_core as pc
from src.models.common import BACKTEST_SEASONS, ROOT_DIR, load_matches, save_backtest, to_standard

MODEL = "poisson_goals"
OUT_DIR = ROOT_DIR / "outputs" / MODEL
TUNING_SEASONS = ["1617", "1718", "1819", "1920", "2021", "2122", "2223"]
GRID = {
    "window_days": [365, 548, 730],
    "ridge": [1.0, 3.0, 10.0, 30.0],
    "promoted_prior": ["average", "relegated"],
}


def tune(matches: pd.DataFrame) -> pd.DataFrame:
    """Log loss of every grid point on the tuning seasons, using data up to 2022-23 only."""
    train = matches[matches["season"] <= TUNING_SEASONS[-1]]
    rows = []
    for values in itertools.product(*GRID.values()):
        p = pc.PoissonParams(**dict(zip(GRID, values)))
        pred = pc.walk_forward(train, TUNING_SEASONS, p)
        per_season = {s: pc.log_loss(g) for s, g in pred.groupby("season")}
        rows.append({**{k: asdict(p)[k] for k in GRID}, "log_loss": pc.log_loss(pred),
                     **{f"ll_{s}": v for s, v in per_season.items()}})
    return pd.DataFrame(rows).sort_values("log_loss").reset_index(drop=True)


def backtest(matches: pd.DataFrame, p: pc.PoissonParams, name: str = MODEL) -> pd.DataFrame:
    """Walk-forward over the backtest seasons -> standard rows (plus expected goals)."""
    pred = pc.walk_forward(matches, BACKTEST_SEASONS, p)
    rows = to_standard(pred["match_id"], pred[["p_home", "p_draw", "p_away"]].to_numpy(), name, p.version(name))
    rows["exp_home_goals"] = pred["exp_home_goals"].round(4).to_numpy()
    rows["exp_away_goals"] = pred["exp_away_goals"].round(4).to_numpy()
    return rows


def worked_example(matches: pd.DataFrame, p: pc.PoissonParams) -> None:
    """Arsenal v Leeds (MW6) as fitted on 6 Oct 2026: parameters, expected goals and the
    scoreline grid, saved for docs/models/poisson_goals.md."""
    fx = pd.DataFrame({"match_id": ["2627_arsenal_leeds"], "season": ["2627"],
                       "home": ["Arsenal"], "away": ["Leeds"]})
    probs, lam, mu, f = pc.predict_fixtures(matches, fx, p, pd.Timestamp("2026-10-06"))
    values = {"c": f.c, "h": f.h, "att_arsenal": f.att["Arsenal"], "def_leeds": f.dfn["Leeds"],
              "att_leeds": f.att["Leeds"], "def_arsenal": f.dfn["Arsenal"], "exp_home_goals": lam[0],
              "exp_away_goals": mu[0], "p_home": probs[0, 0], "p_draw": probs[0, 1], "p_away": probs[0, 2]}
    pd.Series(values, name="value").to_csv(OUT_DIR / "worked_example.csv")
    pc.scoreline_grid(lam[0], mu[0], max_goals=4).round(4).to_csv(OUT_DIR / "worked_example_grid.csv")
    print(f"worked example Arsenal v Leeds: expected goals {lam[0]:.2f} - {mu[0]:.2f}, "
          f"H/D/A {probs[0, 0]:.3f} {probs[0, 1]:.3f} {probs[0, 2]:.3f}")


def main() -> None:
    matches = load_matches()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    grid = tune(matches)
    grid.to_csv(OUT_DIR / "tuning.csv", index=False)
    print(f"tuning on {TUNING_SEASONS[0]}..{TUNING_SEASONS[-1]} ({len(grid)} settings):")
    print(grid.round(4).to_string(index=False))

    best = grid.iloc[0]
    p = pc.PoissonParams(window_days=int(best["window_days"]), ridge=float(best["ridge"]),
                         promoted_prior=str(best["promoted_prior"]))
    print(f"\nchosen: {p.version(MODEL)}")
    save_backtest(backtest(matches, p), MODEL)

    # D2 on the backtest seasons too (for information only; the choice above was made on tuning seasons).
    other = "relegated" if p.promoted_prior == "average" else "average"
    for prior in [p.promoted_prior, other]:
        q = pc.PoissonParams(window_days=p.window_days, ridge=p.ridge, promoted_prior=prior)
        pred = pc.walk_forward(matches, BACKTEST_SEASONS, q)
        print(f"backtest log loss with promoted prior '{prior}': {pc.log_loss(pred):.4f}")
    worked_example(matches, p)


if __name__ == "__main__":
    main()
