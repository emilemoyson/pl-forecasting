"""Download Premier League results + odds files from football-data.co.uk.

Downloads once into data/raw/football_data/. Existing files are left
alone; delete a file manually to force a re-download of that season.
"""

from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "football_data"

SEASONS = [
    "1415", "1516", "1617", "1718", "1819", "1920",
    "2021", "2122", "2223", "2324", "2425", "2526", "2627",
]

BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/E0.csv"


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


if __name__ == "__main__":
    download_all()
