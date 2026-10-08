"""Baseline start probability per player, from FPL data only (no news reading).

    p_start_baseline = (starts this season / team matches played this season)
                       x (FPL chance of playing next round / 100, or 1 if empty)

This is the benchmark the news-checker's p_start is scored against
(step 2.1). Every player of every team in the matchweek gets a row.

Usage: python -m src.features.availability --matchweek 6 [--no-refresh]
Writes outputs/news/2026-27/mwXX_availability_baseline.csv.
"""

from __future__ import annotations

import argparse
import json

import pandas as pd

from src.clean.team_names import to_canonical
from src.collect import download_fpl
from src.models.common import ROOT_DIR, utc_now

SEASON_DIR = "2026-27"
OUT_DIR = ROOT_DIR / "outputs" / "news" / SEASON_DIR
POSITIONS = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}


def load_bootstrap() -> dict:
    return json.loads((download_fpl.RAW_DIR / "bootstrap_static.json").read_text())


def check_next_round(bootstrap: dict, mw: int) -> None:
    """FPL's chance_of_playing_next_round refers to the 'next' gameweek. It must be this matchweek."""
    nxt = [e["id"] for e in bootstrap["events"] if e["is_next"]]
    if nxt != [mw]:
        raise RuntimeError(f"FPL's next gameweek is {nxt}, not {mw}: chance_of_playing_next_round "
                           "would refer to the wrong round. Refresh FPL or check the matchweek.")


def team_matches_played(fixtures: pd.DataFrame, mw: int) -> pd.Series:
    """Finished league matches per team (FPL name) before matchweek mw."""
    done = fixtures[fixtures["finished"].astype(bool) & (fixtures["event"] < mw)]
    return pd.concat([done["home"], done["away"]]).value_counts()


def baseline_start_probs(bootstrap: dict, fixtures: pd.DataFrame, mw: int) -> pd.DataFrame:
    """One row per player of every team playing in matchweek mw, with p_start_baseline."""
    players = pd.DataFrame(bootstrap["elements"])
    team_name = {t["id"]: t["name"] for t in bootstrap["teams"]}
    players["team_fpl"] = players["team"].map(team_name)

    mwf = fixtures[fixtures["event"] == mw]
    playing = set(mwf["home"]) | set(mwf["away"])
    players = players[players["team_fpl"].isin(playing)].copy()

    played = team_matches_played(fixtures, mw)
    players["team_matches"] = players["team_fpl"].map(played).fillna(0).astype(int)
    if (players["team_matches"] == 0).any():
        raise ValueError("a team in this matchweek has no finished matches; start share undefined")

    # A player who moved between PL clubs could have more starts than his new team has matches.
    players["start_share"] = (players["starts"] / players["team_matches"]).clip(upper=1.0)
    chance = players["chance_of_playing_next_round"]
    players["fpl_chance"] = chance.fillna(100.0)
    players["p_start_baseline"] = players["start_share"] * players["fpl_chance"] / 100

    # The player's matchweek fixture, so news rows and baselines join on fpl_id + match.
    opp = {**dict(zip(mwf["home"], mwf["away"])), **dict(zip(mwf["away"], mwf["home"]))}
    venue = {**{t: "H" for t in mwf["home"]}, **{t: "A" for t in mwf["away"]}}
    out = pd.DataFrame({
        "fpl_id": players["id"],
        "player": players["web_name"],
        "full_name": players["first_name"] + " " + players["second_name"],
        "team": to_canonical(players["team_fpl"], "fpl"),
        "opponent": to_canonical(players["team_fpl"].map(opp), "fpl"),
        "venue": players["team_fpl"].map(venue),
        "position": players["element_type"].map(POSITIONS),
        "fpl_status": players["status"],
        "fpl_chance_next_round": chance,
        "fpl_news": players["news"].replace("", pd.NA),
        "minutes": players["minutes"],
        "starts": players["starts"],
        "team_matches": players["team_matches"],
        "start_share": players["start_share"].round(4),
        "p_start_baseline": players["p_start_baseline"].round(4),
    })
    return out.sort_values(["team", "p_start_baseline"], ascending=[True, False]).reset_index(drop=True)


def sanity_checks(out: pd.DataFrame) -> None:
    """Ranges, missing values, and expected starters per team (should be close to 11)."""
    print(f"players: {len(out)} across {out['team'].nunique()} teams, "
          f"with minutes > 0: {int((out['minutes'] > 0).sum())}")
    print(f"p_start_baseline range [{out['p_start_baseline'].min()}, {out['p_start_baseline'].max()}], "
          f"missing {int(out['p_start_baseline'].isna().sum())}, "
          f"FPL flag set for {int(out['fpl_chance_next_round'].notna().sum())} players")
    per_team = out.groupby("team")["p_start_baseline"].sum().round(2).sort_values()
    print("expected starters per team (sum of p_start_baseline; 11 if nobody is flagged):")
    print("  " + ", ".join(f"{t} {v}" for t, v in per_team.items()))


def run(mw: int, refresh: bool = True) -> pd.DataFrame:
    if refresh:
        download_fpl.download_all()
    bootstrap = load_bootstrap()
    check_next_round(bootstrap, mw)
    fixtures = download_fpl.fixtures_table()
    if fixtures.loc[fixtures["event"] == mw, "started"].fillna(False).astype(bool).any():
        raise RuntimeError(f"matchweek {mw} has started; the baseline must be computed before kickoff")
    out = baseline_start_probs(bootstrap, fixtures, mw)
    out.insert(len(out.columns), "computed_at_utc", utc_now())
    sanity_checks(out)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"mw{mw:02d}_availability_baseline.csv"
    out.to_csv(path, index=False)
    print(f"wrote {path.relative_to(ROOT_DIR)}")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Baseline start probability per player from FPL data.")
    parser.add_argument("--matchweek", type=int, required=True)
    parser.add_argument("--no-refresh", action="store_true", help="use the FPL files already on disk")
    args = parser.parse_args()
    run(args.matchweek, refresh=not args.no_refresh)
