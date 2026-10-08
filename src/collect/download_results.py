"""Download Premier League results + odds files from football-data.co.uk.

Completed seasons are downloaded once into data/raw/football_data/ and
never again. The current season is re-downloaded before each matchweek
with refresh_current_season(), which overwrites only that file.

download_fixtures() saves football-data's upcoming-matches file
(pre-match odds) as a new timestamped raw file each time.
"""

from datetime import datetime, timezone
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "football_data"

SEASONS = [
    "1415", "1516", "1617", "1718", "1819", "1920",
    "2021", "2122", "2223", "2324", "2425", "2526", "2627",
]

CURRENT_SEASON = "2627"
BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/E0.csv"
FIXTURES_URL = "https://www.football-data.co.uk/fixtures.csv"
FIXTURES_DIR = RAW_DIR / "fixtures"
HEADERS = {"User-Agent": "pl-forecasting research project"}


def download_all() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for season in SEASONS:
        out_path = RAW_DIR / f"E0_{season}.csv"
        if out_path.exists():
            print(f"{season}: already have {out_path.name}, skipping")
            continue
        url = BASE_URL.format(season=season)
        resp = requests.get(url, timeout=30)
        if resp.status_code != 200 or not resp.content:
            print(f"{season}: FAILED ({resp.status_code}) from {url}")
            continue
        out_path.write_bytes(resp.content)
        print(f"{season}: saved {out_path.name} ({len(resp.content)} bytes)")


def _get_csv(url: str) -> bytes:
    """Fetch a CSV and fail loudly on errors or an HTML page in place of a CSV."""
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    body = resp.content
    if not body or body.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
        raise RuntimeError(f"{url} did not return a CSV")
    return body


def refresh_current_season() -> Path:
    """Re-download the current season file, overwriting it. Refuses to replace it
    with a file that has fewer lines (a partial or broken download)."""
    out_path = RAW_DIR / f"E0_{CURRENT_SEASON}.csv"
    body = _get_csv(BASE_URL.format(season=CURRENT_SEASON))
    n_lines = body.count(b"\n")
    if out_path.exists() and n_lines < out_path.read_bytes().count(b"\n"):
        raise RuntimeError(f"new {out_path.name} has fewer rows than the existing one; not overwriting")
    out_path.write_bytes(body)
    print(f"{CURRENT_SEASON}: refreshed {out_path.name} ({n_lines} lines)")
    return out_path


def download_fixtures() -> tuple[Path, str]:
    """Save fixtures.csv (upcoming matches with pre-match odds) as a new timestamped file.

    Returns the path and the collection time in UTC (ISO 8601).
    """
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    collected = datetime.now(timezone.utc)
    body = _get_csv(FIXTURES_URL)
    out_path = FIXTURES_DIR / f"fixtures_{collected.strftime('%Y%m%dT%H%M%SZ')}.csv"
    out_path.write_bytes(body)
    print(f"saved {out_path.relative_to(RAW_DIR.parents[1])} ({len(body)} bytes)")
    return out_path, collected.strftime("%Y-%m-%dT%H:%M:%SZ")


if __name__ == "__main__":
    download_all()
