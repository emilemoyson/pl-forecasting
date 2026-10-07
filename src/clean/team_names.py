"""Team name mapping: every source name goes to one canonical name.

The mapping lives in data/team_names.csv (columns canonical,
football_data, understat, fpl). Canonical names are the Understat full
names. An unmapped name is an error, not a warning.
"""

import glob
import json
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[2]
MAPPING_PATH = ROOT_DIR / "data" / "team_names.csv"
RAW_DIR = ROOT_DIR / "data" / "raw"

SOURCES = ["football_data", "understat", "fpl"]


def load_mapping() -> pd.DataFrame:
    """Read data/team_names.csv as strings, empty cells as NaN."""
    return pd.read_csv(MAPPING_PATH, dtype=str, keep_default_na=False).replace("", pd.NA)


def raw_names_football_data() -> set[str]:
    """All HomeTeam / AwayTeam values across the football-data season files."""
    names: set[str] = set()
    for path in sorted(glob.glob(str(RAW_DIR / "football_data" / "E0_*.csv"))):
        df = pd.read_csv(path, encoding="latin-1", usecols=["HomeTeam", "AwayTeam"])
        names |= set(df["HomeTeam"].dropna()) | set(df["AwayTeam"].dropna())
    return names


def raw_names_understat() -> set[str]:
    """All home_team / away_team values across the Understat season CSVs."""
    names: set[str] = set()
    for path in sorted(glob.glob(str(RAW_DIR / "understat" / "understat_*.csv"))):
        df = pd.read_csv(path, usecols=["home_team", "away_team"])
        names |= set(df["home_team"].dropna()) | set(df["away_team"].dropna())
    return names


def raw_names_fpl() -> set[str]:
    """Team names in the FPL bootstrap-static file (current season only)."""
    path = RAW_DIR / "fpl" / "bootstrap_static.json"
    if not path.exists():
        return set()
    return {t["name"] for t in json.loads(path.read_text())["teams"]}


RAW_NAME_READERS = {
    "football_data": raw_names_football_data,
    "understat": raw_names_understat,
    "fpl": raw_names_fpl,
}


def to_canonical(names: pd.Series, source: str) -> pd.Series:
    """Map a Series of source names to canonical names. Raises on any unmapped name."""
    mapping = load_mapping().dropna(subset=[source]).set_index(source)["canonical"]
    out = names.map(mapping)
    unmapped = sorted(set(names[out.isna()].dropna()))
    if unmapped:
        raise ValueError(f"Unmapped {source} team names: {unmapped}")
    return out
