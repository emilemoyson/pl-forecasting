"""Build the master matches table: one row per Premier League match.

Joins football-data (results + odds) and Understat (xG) on
season + canonical home team + canonical away team. Each pairing happens
once per season, so this key is unique. Goals and dates come from
football-data; Understat goals are only used as a cross-check.

Writes data/processed/matches.parquet and prints sanity checks.
"""

import glob
from pathlib import Path

import pandas as pd

from src.clean.team_names import to_canonical

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw"
OUT_PATH = ROOT_DIR / "data" / "processed" / "matches.parquet"

CURRENT_SEASON = "2627"
KEY = ["season", "home", "away"]

# Output name -> football-data column. Avg/Max columns only exist from
# 2019-20, so they are empty before that.
ODDS_COLS = {
    "b365_h": "B365H", "b365_d": "B365D", "b365_a": "B365A",
    "avg_h": "AvgH", "avg_d": "AvgD", "avg_a": "AvgA",
    "avg_close_h": "AvgCH", "avg_close_d": "AvgCD", "avg_close_a": "AvgCA",
    "max_h": "MaxH", "max_d": "MaxD", "max_a": "MaxA",
}

COLUMNS = [
    "match_id", "season", "date", "home", "away",
    "home_goals", "away_goals", "home_xg", "away_xg", *ODDS_COLS,
]


def load_football_data() -> pd.DataFrame:
    """All football-data season files -> season, date, home, away, goals, odds.

    Drops fully empty rows (the 2014-15 file has one trailing blank row).
    """
    frames = []
    for path in sorted(glob.glob(str(RAW_DIR / "football_data" / "E0_*.csv"))):
        season = Path(path).stem.split("_")[1]
        raw = pd.read_csv(path, encoding="latin-1", low_memory=False)
        blank = raw["HomeTeam"].isna() & raw["AwayTeam"].isna() & raw["Date"].isna()
        if blank.any():
            print(f"football-data {season}: dropped {int(blank.sum())} empty row(s)")
        raw = raw[~blank]
        df = pd.DataFrame({
            "season": season,
            # 2014-15 to 2018-19 use 2-digit years (16/08/14), later seasons 4-digit.
            "date": pd.to_datetime(raw["Date"], format="mixed", dayfirst=True),
            "home": to_canonical(raw["HomeTeam"], "football_data"),
            "away": to_canonical(raw["AwayTeam"], "football_data"),
            "home_goals": raw["FTHG"].astype("Int64"),
            "away_goals": raw["FTAG"].astype("Int64"),
        })
        for out_col, fd_col in ODDS_COLS.items():
            df[out_col] = raw[fd_col].astype(float) if fd_col in raw else float("nan")
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def load_understat() -> pd.DataFrame:
    """All Understat season CSVs -> season, date, home, away, xG and Understat goals."""
    frames = []
    for path in sorted(glob.glob(str(RAW_DIR / "understat" / "understat_*.csv"))):
        season = Path(path).stem.split("_")[1]
        raw = pd.read_csv(path)
        frames.append(pd.DataFrame({
            "season": season,
            "us_date": pd.to_datetime(raw["date"]).dt.normalize(),
            "home": to_canonical(raw["home_team"], "understat"),
            "away": to_canonical(raw["away_team"], "understat"),
            "home_xg": raw["home_xg"].astype(float),
            "away_xg": raw["away_xg"].astype(float),
            "us_home_goals": raw["home_goals"].astype("Int64"),
            "us_away_goals": raw["away_goals"].astype("Int64"),
        }))
    return pd.concat(frames, ignore_index=True)


def join_sources(fd: pd.DataFrame, us: pd.DataFrame) -> pd.DataFrame:
    """Outer join on season + home + away. The _merge column shows unmatched rows."""
    for name, df in [("football-data", fd), ("understat", us)]:
        dupes = df[df.duplicated(KEY, keep=False)]
        if not dupes.empty:
            raise ValueError(f"{name}: duplicate season/home/away keys:\n{dupes[KEY]}")
    return fd.merge(us, on=KEY, how="outer", indicator=True, validate="one_to_one")


def make_match_id(df: pd.DataFrame) -> pd.Series:
    """Readable id like '2627_arsenal_coventry' (season_home_away, spaces -> hyphens)."""
    def slug(s: pd.Series) -> pd.Series:
        return s.str.lower().str.replace(" ", "-", regex=False)
    return df["season"] + "_" + slug(df["home"]) + "_" + slug(df["away"])


def build() -> pd.DataFrame:
    """Load both sources, join, run the checks, return the master table."""
    merged = join_sources(load_football_data(), load_understat())

    unmatched = merged[merged["_merge"] != "both"]
    print(f"\nUnmatched matches: {len(unmatched)}")
    if not unmatched.empty:
        print(unmatched[KEY + ["date", "us_date", "_merge"]].to_string(index=False))
        raise ValueError("Some matches have no partner in the other source")

    date_gap = (merged["date"] - merged["us_date"]).dt.days.abs()
    print(f"\nDate differences: {int((date_gap > 0).sum())} matches differ at all, "
          f"{int((date_gap > 2).sum())} by more than 2 days")
    if (date_gap > 2).any():
        print(merged.loc[date_gap > 2, KEY + ["date", "us_date"]].to_string(index=False))

    goal_diff = ((merged["home_goals"] != merged["us_home_goals"])
                 | (merged["away_goals"] != merged["us_away_goals"]))
    print(f"\nGoal mismatches (football-data vs Understat): {int(goal_diff.sum())}")
    if goal_diff.any():
        cols = KEY + ["date", "home_goals", "away_goals", "us_home_goals", "us_away_goals"]
        print(merged.loc[goal_diff, cols].to_string(index=False))

    merged["match_id"] = make_match_id(merged)
    return merged[COLUMNS].sort_values(["date", "home"]).reset_index(drop=True)


def sanity_checks(matches: pd.DataFrame) -> None:
    """Print row counts per season, missing values and value ranges."""
    print(f"\nRows: {len(matches)}, unique match_id: {matches['match_id'].is_unique}")
    print("\nRows per season, missing values and odds fill:")
    summary = matches.groupby("season").agg(
        rows=("match_id", "size"),
        first=("date", "min"),
        last=("date", "max"),
        miss_goals=("home_goals", lambda x: x.isna().sum()),
        miss_xg=("home_xg", lambda x: x.isna().sum()),
        b365=("b365_h", "count"),
        avg=("avg_h", "count"),
        avg_close=("avg_close_h", "count"),
        max=("max_h", "count"),
    )
    print(summary.to_string())
    print("\nValue ranges:")
    print(matches.drop(columns=["match_id", "season", "home", "away"]).describe().T[["min", "max"]].to_string())


def main() -> None:
    matches = build()
    sanity_checks(matches)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    matches.to_parquet(OUT_PATH, index=False)
    print(f"\nSaved {OUT_PATH.relative_to(ROOT_DIR)} ({len(matches)} rows)")


if __name__ == "__main__":
    main()
