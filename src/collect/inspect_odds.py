"""Report which odds columns exist per season and how full they are.

Read-only diagnostic over data/raw/football_data/. Does not clean or
write anything into data/raw; just prints a report so we can pick which
odds columns to use downstream (pre-match vs closing, Pinnacle vs
market average). The full fill-rate table is written to outputs/.
"""

from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw" / "football_data"
OUT_DIR = ROOT_DIR / "outputs"

SEASONS = [
    "1415", "1516", "1617", "1718", "1819", "1920",
    "2021", "2122", "2223", "2324", "2425", "2526", "2627",
]

CORE_COLS = {
    "Div", "Date", "Time", "HomeTeam", "AwayTeam",
    "FTHG", "FTAG", "FTR", "HTHG", "HTAG", "HTR",
    "Referee", "HS", "AS", "HST", "AST", "HF", "AF",
    "HC", "AC", "HY", "AY", "HR", "AR",
}

# Key H/D/A columns worth tracking individually: pre-match and closing,
# for a bookmaker (Bet365) a sharp book (Pinnacle) and the market
# average/max across all bookmakers tracked.
KEY_GROUPS = {
    "B365 pre-match (H/D/A)": ["B365H", "B365D", "B365A"],
    "B365 closing (H/D/A)": ["B365CH", "B365CD", "B365CA"],
    "Pinnacle pre-match (H/D/A)": ["PSH", "PSD", "PSA"],
    "Pinnacle closing (H/D/A)": ["PSCH", "PSCD", "PSCA"],
    "Market average pre-match (H/D/A)": ["AvgH", "AvgD", "AvgA"],
    "Market average closing (H/D/A)": ["AvgCH", "AvgCD", "AvgCA"],
    "Market max pre-match (H/D/A)": ["MaxH", "MaxD", "MaxA"],
    "Market max closing (H/D/A)": ["MaxCH", "MaxCD", "MaxCA"],
}


def load_all():
    return {s: pd.read_csv(RAW_DIR / f"E0_{s}.csv", low_memory=False) for s in SEASONS}


def report_all_odds_columns(frames):
    all_cols = set()
    for df in frames.values():
        all_cols |= set(df.columns)
    odds_cols = sorted(all_cols - CORE_COLS)
    print(f"Total distinct non-core columns across all seasons: {len(odds_cols)}\n")
    return odds_cols


def report_key_groups(frames):
    rows = []
    for season, df in frames.items():
        row = {"season": season, "n_matches": len(df)}
        for group_name, cols in KEY_GROUPS.items():
            present = [c for c in cols if c in df.columns]
            if not present:
                row[group_name] = "missing"
            else:
                fill = df[present].notna().all(axis=1).mean()
                row[group_name] = f"{fill:.0%}"
        rows.append(row)
    out = pd.DataFrame(rows).set_index("season")
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 20)
    print(out.to_string())
    return out


def report_general_fill(frames, odds_cols):
    rows = []
    for season, df in frames.items():
        row = {"season": season}
        for c in odds_cols:
            row[c] = round(df[c].notna().mean() * 100, 1) if c in df.columns else None
        rows.append(row)
    return pd.DataFrame(rows).set_index("season")


if __name__ == "__main__":
    frames = load_all()
    odds_cols = report_all_odds_columns(frames)
    print("=== Key bookmaker H/D/A columns: fraction of matches with all 3 filled ===\n")
    report_key_groups(frames)

    full = report_general_fill(frames, odds_cols)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "odds_fill_report.csv"
    full.to_csv(out_path)
    print(f"\nFull per-column fill report (all {len(odds_cols)} columns) written to {out_path}")
