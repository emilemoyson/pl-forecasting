"""Poisson model on an xG / goals blend with time decay. The main model.

Same engine as poisson_goals (see poisson_core), with:
- response y = w * xG + (1 - w) * goals (decision D3),
- weights 0.5 ** (age in days / half-life), so recent matches count more (D3),
- an optional Dixon-Coles low-score correction fitted on actual goals (D4).

Everything is chosen on the tuning seasons 2019-20 to 2022-23 only (data up
to 2022-23). The backtest seasons are reported but never used to choose.
Promoted teams use the relegated-average prior (D2).

Usage: python -m src.models.poisson_xg
"""

from __future__ import annotations

import itertools
from dataclasses import asdict, replace

import pandas as pd

from src.models import poisson_core as pc
from src.models.common import BACKTEST_SEASONS, ROOT_DIR, load_matches, save_backtest
from src.models.poisson_goals import backtest

MODEL = "poisson_xg"
OUT_DIR = ROOT_DIR / "outputs" / MODEL
TUNING_SEASONS = ["1920", "2021", "2122", "2223"]
GRID = {
    "xg_weight": [0.0, 0.25, 0.5, 0.75, 1.0],
    "half_life_days": [0.0, 60.0, 120.0, 240.0, 480.0],
    "window_days": [365, 1095],
    "ridge": [1.0, 3.0, 10.0],
}
FIXED = {"promoted_prior": "relegated"}  # D2


def score_tuning(train: pd.DataFrame, p: pc.PoissonParams) -> dict:
    pred = pc.walk_forward(train, TUNING_SEASONS, p)
    return {"log_loss": pc.log_loss(pred), **{f"ll_{s}": pc.log_loss(g) for s, g in pred.groupby("season")}}


def tune(matches: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """D3 grid (no Dixon-Coles), then D4: Dixon-Coles on vs off for the best D3 setting.
    Only matches up to 2022-23 are used."""
    train = matches[matches["season"] <= TUNING_SEASONS[-1]]
    rows = []
    for values in itertools.product(*GRID.values()):
        p = pc.PoissonParams(**dict(zip(GRID, values)), **FIXED)
        rows.append({**{k: asdict(p)[k] for k in GRID}, **score_tuning(train, p)})
    grid = pd.DataFrame(rows).sort_values("log_loss").reset_index(drop=True)

    best = params_from_row(grid.iloc[0], dixon_coles=False)
    dc = pd.DataFrame([{"dixon_coles": flag, **score_tuning(train, replace(best, dixon_coles=flag))}
                       for flag in [False, True]])
    return grid, dc


def params_from_row(row: pd.Series, dixon_coles: bool) -> pc.PoissonParams:
    return pc.PoissonParams(xg_weight=float(row["xg_weight"]), half_life_days=float(row["half_life_days"]),
                            window_days=int(row["window_days"]), ridge=float(row["ridge"]),
                            dixon_coles=dixon_coles, **FIXED)


def worked_example(matches: pd.DataFrame, p: pc.PoissonParams) -> None:
    """Arsenal v Leeds (MW6) as fitted on 6 Oct 2026, for docs/models/poisson_xg.md."""
    fx = pd.DataFrame({"match_id": ["2627_arsenal_leeds"], "season": ["2627"],
                       "home": ["Arsenal"], "away": ["Leeds"]})
    probs, lam, mu, f = pc.predict_fixtures(matches, fx, p, pd.Timestamp("2026-10-06"))
    values = {"c": f.c, "h": f.h, "rho": f.rho, "att_arsenal": f.att["Arsenal"], "def_leeds": f.dfn["Leeds"],
              "att_leeds": f.att["Leeds"], "def_arsenal": f.dfn["Arsenal"], "exp_home_goals": lam[0],
              "exp_away_goals": mu[0], "p_home": probs[0, 0], "p_draw": probs[0, 1], "p_away": probs[0, 2]}
    pd.Series(values, name="value").to_csv(OUT_DIR / "worked_example.csv")
    pc.scoreline_grid(lam[0], mu[0], f.rho, max_goals=4).round(4).to_csv(OUT_DIR / "worked_example_grid.csv")
    print(f"worked example Arsenal v Leeds: expected goals {lam[0]:.2f} - {mu[0]:.2f}, rho {f.rho:.3f}, "
          f"H/D/A {probs[0, 0]:.3f} {probs[0, 1]:.3f} {probs[0, 2]:.3f}")


def main() -> None:
    matches = load_matches()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    grid, dc = tune(matches)
    grid.to_csv(OUT_DIR / "tuning.csv", index=False)
    dc.to_csv(OUT_DIR / "tuning_dixon_coles.csv", index=False)
    print(f"D3 grid on {TUNING_SEASONS[0]}..{TUNING_SEASONS[-1]}: {len(grid)} settings, top 10:")
    print(grid.head(10).round(4).to_string(index=False))
    print("\nD4, Dixon-Coles for the best D3 setting (tuning seasons):")
    print(dc.round(4).to_string(index=False))

    use_dc = bool(dc.loc[dc["log_loss"].idxmin(), "dixon_coles"])
    p = params_from_row(grid.iloc[0], dixon_coles=use_dc)
    print(f"\nchosen: {p.version(MODEL)}")
    save_backtest(backtest(matches, p, MODEL), MODEL)

    # Reported only, never used to choose: the backtest with Dixon-Coles the other way.
    other = replace(p, dixon_coles=not use_dc)
    for q in [p, other]:
        print(f"backtest log loss, dixon_coles={q.dixon_coles}: "
              f"{pc.log_loss(pc.walk_forward(matches, BACKTEST_SEASONS, q)):.4f}")
    worked_example(matches, p)


if __name__ == "__main__":
    main()
