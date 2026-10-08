"""Level checks for a goals model's backtest: draws and goals, predicted against actual.

For each backtest season and overall:
- average predicted draw probability vs the actual draw rate,
- average predicted goals per team per match vs actual goals per team per match.

Usage: python -m src.evaluate.model_checks poisson_xg
Writes outputs/<model>/draw_goals_check.csv.
"""

from __future__ import annotations

import argparse

import pandas as pd

from src.models.common import BACKTEST_DIR, ROOT_DIR, load_matches

DRAW_FLAG_POINTS = 2.0  # flag if predicted and actual draw rates differ by more than this


def draw_goals_check(model: str) -> pd.DataFrame:
    preds = pd.read_csv(BACKTEST_DIR / f"{model}.csv")
    m = preds.merge(load_matches()[["match_id", "season", "home_goals", "away_goals"]], on="match_id")
    m["draw"] = (m["home_goals"] == m["away_goals"]).astype(float)
    m["pred_goals_team"] = (m["exp_home_goals"] + m["exp_away_goals"]) / 2
    m["actual_goals_team"] = (m["home_goals"] + m["away_goals"]) / 2

    def summary(g: pd.DataFrame) -> dict:
        return {"n": len(g),
                "pred_draw_pct": 100 * g["p_draw"].mean(), "actual_draw_pct": 100 * g["draw"].mean(),
                "draw_gap_points": 100 * (g["p_draw"].mean() - g["draw"].mean()),
                "pred_goals_per_team": g["pred_goals_team"].mean(),
                "actual_goals_per_team": g["actual_goals_team"].mean(),
                "pred_home_goals": g["exp_home_goals"].mean(), "actual_home_goals": g["home_goals"].mean(),
                "pred_away_goals": g["exp_away_goals"].mean(), "actual_away_goals": g["away_goals"].mean()}

    rows = [{"season": s, **summary(g)} for s, g in m.groupby("season")]
    rows.append({"season": "all", **summary(m)})
    return pd.DataFrame(rows)


def xg_vs_goals(from_season: str = "2223") -> pd.DataFrame:
    """Average xG and goals per team per match by season (all played matches)."""
    m = load_matches().dropna(subset=["home_goals", "away_goals"])
    m = m[m["season"] >= from_season]
    out = m.groupby("season").agg(n=("match_id", "size"), hg=("home_goals", "mean"), ag=("away_goals", "mean"),
                                  hx=("home_xg", "mean"), ax=("away_xg", "mean"))
    out["goals_per_team"] = (out["hg"] + out["ag"]) / 2
    out["xg_per_team"] = (out["hx"] + out["ax"]) / 2
    out["xg_minus_goals"] = out["xg_per_team"] - out["goals_per_team"]
    return out[["n", "goals_per_team", "xg_per_team", "xg_minus_goals"]].reset_index()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("model")
    model = parser.parse_args().model
    table = draw_goals_check(model)
    out = ROOT_DIR / "outputs" / model / "draw_goals_check.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(out, index=False)
    print(table.round(3).to_string(index=False))
    gap = table.loc[table["season"] == "all", "draw_gap_points"].iloc[0]
    flag = abs(gap) > DRAW_FLAG_POINTS
    print(f"\noverall draw gap {gap:+.2f} points -> {'FLAG for MW7' if flag else 'within 2 points, no flag'}")
    print(f"saved {out.relative_to(ROOT_DIR)}")
    xg = xg_vs_goals()
    xg.to_csv(out.parent / "xg_vs_goals.csv", index=False)
    print("\nxG vs goals per team per match (all played matches):")
    print(xg.round(3).to_string(index=False))


if __name__ == "__main__":
    main()
