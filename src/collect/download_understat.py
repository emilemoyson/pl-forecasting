"""Download Understat team-level match stats (goals, xG) for the PL.

Uses soccerdata.Understat rather than a custom scraper. soccerdata
caches raw responses under data_dir itself and, by default, never
re-fetches a season that has already finished - only the current
season is re-checked. We point that cache at data/raw/understat/ so
the cache lives inside the project, then also write one plain CSV per
season there for easy inspection.
"""

from pathlib import Path

import soccerdata as sd

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw" / "understat"

LEAGUE = "ENG-Premier League"
# Hyphenated "YYYY-YY" form, e.g. "2014-15" .. "2026-27". A bare 4-digit
# start year like "2021" is ambiguous to soccerdata - it can be parsed
# either as the start year 2021 (season 2021-22) or as the season code
# "20-21" itself, and for some years it picks the wrong one. Hyphenated
# strings are parsed unambiguously.
SEASONS = [f"{y}-{str(y + 1)[2:]}" for y in range(2014, 2027)]


def download_all() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    reader = sd.Understat(leagues=LEAGUE, seasons=SEASONS, data_dir=RAW_DIR)
    df = reader.read_team_match_stats()
    df = df.reset_index()

    for season_code, season_df in df.groupby("season"):
        out_path = RAW_DIR / f"understat_{season_code}.csv"
        season_df.to_csv(out_path, index=False)
        print(f"{season_code}: saved {out_path.name} ({len(season_df)} rows)")


CURRENT_SEASON = "2026-27"


def refresh_current_season() -> None:
    """Re-fetch the current season only (bypassing the cache) and overwrite its CSV.

    Refuses to overwrite with fewer matches than the file already has.
    """
    reader = sd.Understat(leagues=LEAGUE, seasons=[CURRENT_SEASON], data_dir=RAW_DIR, no_cache=True)
    df = reader.read_team_match_stats().reset_index()
    for season_code, season_df in df.groupby("season"):
        out_path = RAW_DIR / f"understat_{season_code}.csv"
        if out_path.exists() and len(season_df) < sum(1 for _ in out_path.open()) - 1:
            raise RuntimeError(f"new {out_path.name} has fewer rows than the existing one; not overwriting")
        season_df.to_csv(out_path, index=False)
        print(f"{season_code}: refreshed {out_path.name} ({len(season_df)} rows)")


if __name__ == "__main__":
    download_all()
