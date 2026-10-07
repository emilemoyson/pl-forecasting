"""Report rows per season, missing xG, and team names in the Understat data.

Read-only diagnostic over data/raw/understat/. Does not clean or join
anything - just checks what we actually got before building the master
table.
"""

from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw" / "understat"

SEASONS = [
    "1415", "1516", "1617", "1718", "1819", "1920",
    "2021", "2122", "2223", "2324", "2425", "2526", "2627",
]

XG_COLS = ["home_xg", "away_xg", "home_np_xg", "away_np_xg"]


def load_all():
    return {s: pd.read_csv(RAW_DIR / f"understat_{s}.csv") for s in SEASONS}


def report_rows_and_missing_xg(frames):
    rows = []
    for season, df in frames.items():
        row = {"season": season, "n_matches": len(df)}
        for col in XG_COLS:
            row[f"{col}_missing"] = int(df[col].isna().sum()) if col in df.columns else "no column"
        rows.append(row)
    out = pd.DataFrame(rows).set_index("season")
    print("=== Rows per season and missing xG values ===\n")
    print(out.to_string())
    return out


def report_team_names(frames):
    teams = set()
    for df in frames.values():
        teams |= set(df["home_team"].unique()) | set(df["away_team"].unique())
    teams = sorted(teams)
    print(f"\n=== {len(teams)} distinct Understat team names across all seasons ===\n")
    for t in teams:
        print(f"  {t}")
    return teams


if __name__ == "__main__":
    frames = load_all()
    report_rows_and_missing_xg(frames)
    report_team_names(frames)
