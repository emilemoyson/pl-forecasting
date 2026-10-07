"""Download the Fantasy Premier League feed (bootstrap-static and fixtures).

FPL only covers the current season, so both files are overwritten on
every run. Run it before each matchweek, like the other 2026-27 files.
Saves raw JSON into data/raw/fpl/ and prints a few sanity checks.
"""

import json
from pathlib import Path

import pandas as pd
import requests

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "fpl"

ENDPOINTS = {
    "bootstrap_static.json": "https://fantasy.premierleague.com/api/bootstrap-static/",
    "fixtures.json": "https://fantasy.premierleague.com/api/fixtures/",
}

HEADERS = {"User-Agent": "pl-forecasting research project"}


def download_all() -> None:
    """Fetch each endpoint and overwrite its JSON file in RAW_DIR."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in ENDPOINTS.items():
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.json()  # fail loudly if the body is not valid JSON
        (RAW_DIR / name).write_bytes(resp.content)
        print(f"saved {name} ({len(resp.content)} bytes)")


def fixtures_table() -> pd.DataFrame:
    """Read the saved FPL files and return fixtures with team names and UTC kickoff."""
    bootstrap = json.loads((RAW_DIR / "bootstrap_static.json").read_text())
    fixtures = pd.DataFrame(json.loads((RAW_DIR / "fixtures.json").read_text()))
    team_names = {t["id"]: t["name"] for t in bootstrap["teams"]}
    fixtures["home"] = fixtures["team_h"].map(team_names)
    fixtures["away"] = fixtures["team_a"].map(team_names)
    fixtures["kickoff_utc"] = pd.to_datetime(fixtures["kickoff_time"], utc=True)
    return fixtures


def sanity_checks(gameweeks: tuple[int, ...] = (6, 7)) -> None:
    """Print team, player and fixture counts, then the fixtures for the given gameweeks."""
    bootstrap = json.loads((RAW_DIR / "bootstrap_static.json").read_text())
    fixtures = fixtures_table()
    print(f"teams: {len(bootstrap['teams'])}")
    print(f"players: {len(bootstrap['elements'])}")
    print(f"fixtures: {len(fixtures)} "
          f"(finished {int(fixtures['finished'].sum())}, "
          f"no gameweek yet {int(fixtures['event'].isna().sum())}, "
          f"no kickoff time {int(fixtures['kickoff_utc'].isna().sum())})")
    print(f"unmapped team ids: {int(fixtures[['home', 'away']].isna().sum().sum())}")
    for gw in gameweeks:
        gw_df = fixtures[fixtures["event"] == gw].sort_values("kickoff_utc")
        print(f"\nGameweek {gw} ({len(gw_df)} fixtures)")
        for _, r in gw_df.iterrows():
            ko = r["kickoff_utc"].strftime("%a %Y-%m-%d %H:%M UTC")
            print(f"  {ko}  {r['home']} v {r['away']}")


if __name__ == "__main__":
    download_all()
    sanity_checks()
