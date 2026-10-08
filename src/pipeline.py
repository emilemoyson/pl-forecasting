"""Live predictions for one matchweek.

    python -m src.pipeline --matchweek 6              # dry run, writes to outputs/dry_run/
    python -m src.pipeline --matchweek 6 --publish    # writes to predictions/2026-27/
    python -m src.pipeline --matchweek 6 --publish --market-only   # odds only, if mw06.csv is already out

Steps:
1. Refresh 2026-27 data (football-data, Understat, FPL) and rebuild matches.parquet.
2. Check every finished FPL fixture is in matches.parquet (no stale data).
3. Read the matchweek's fixtures from FPL. Refuse if any has kicked off.
4. Predict with baseline, Elo, Poisson goals and Poisson xG; write mwXX.csv.
5. Download football-data's fixtures.csv (pre-match odds), log the market's
   probabilities with the collection time; write mwXX_market.csv.
6. Check: probabilities sum to 1, every timestamp is before its kickoff.
7. Write the files only after every check has passed.

predictions/ is append-only: --publish never overwrites a file that git
already tracks, and refuses to run while src/ has uncommitted changes.
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from src.clean import build_matches
from src.clean.build_matches import make_match_id
from src.clean.team_names import to_canonical
from src.clean.times import uk_local_to_utc
from src.collect import download_fpl, download_results, download_understat
from src.models import baseline, elo, market, poisson_goals, poisson_xg
from src.models import poisson_core as pc
from src.models.common import PRED_COLS, PROB_COLS, ROOT_DIR, load_matches, to_standard, utc_now

SEASON = "2627"
SEASON_DIR = "2026-27"
PUBLISH_DIR = ROOT_DIR / "predictions" / SEASON_DIR
DRY_RUN_DIR = ROOT_DIR / "outputs" / "dry_run" / SEASON_DIR
MARKET_VERSION = "avg_prematch_prop_v1"
ODDS_COLS = {"b365_h": "B365H", "b365_d": "B365D", "b365_a": "B365A",
             "avg_h": "AvgH", "avg_d": "AvgD", "avg_a": "AvgA",
             "max_h": "MaxH", "max_d": "MaxD", "max_a": "MaxA"}


# ---------- 1-2: data ----------

def refresh_data() -> list[str]:
    """Refresh the current season from every source. Returns warnings for sources that failed."""
    warnings = []
    for name, fn in [("FPL", download_fpl.download_all),
                     ("football-data", download_results.refresh_current_season),
                     ("Understat", download_understat.refresh_current_season)]:
        try:
            fn()
        except Exception as e:  # keep going: the completeness check below decides if data is usable
            warnings.append(f"{name} refresh failed: {type(e).__name__}: {e}")
            print(f"WARNING: {warnings[-1]}")
    build_matches.main()
    return warnings


def fpl_fixtures() -> pd.DataFrame:
    """FPL fixtures with canonical names, match_id and UTC kickoff."""
    fx = download_fpl.fixtures_table()
    fx["home"] = to_canonical(fx["home"], "fpl")
    fx["away"] = to_canonical(fx["away"], "fpl")
    fx["season"] = SEASON
    fx["match_id"] = make_match_id(fx)
    return fx


def check_no_missing_results(fixtures: pd.DataFrame, matches: pd.DataFrame, now_utc: pd.Timestamp) -> None:
    """Every FPL fixture marked finished, or that kicked off more than 3 hours ago,
    must be in matches.parquet with a score. Catches a stale FPL file as well."""
    played = set(matches.dropna(subset=["home_goals", "away_goals"])["match_id"])
    should_be_played = fixtures["finished"].astype(bool) | (fixtures["kickoff_utc"] < now_utc - pd.Timedelta(hours=3))
    missing = sorted(set(fixtures.loc[should_be_played, "match_id"]) - played)
    if missing:
        raise RuntimeError(f"{len(missing)} finished matches missing from matches.parquet "
                           f"(stale data, refresh first): {missing}")
    print(f"completeness: all {int(should_be_played.sum())} finished or past FPL fixtures are in matches.parquet")


def matchweek_fixtures(fixtures: pd.DataFrame, mw: int, now_utc: pd.Timestamp) -> pd.DataFrame:
    """The matchweek's fixtures. Refuses if any has started or kicks off before now."""
    mwf = fixtures[fixtures["event"] == mw].sort_values(["kickoff_utc", "home"]).reset_index(drop=True)
    if mwf.empty:
        raise ValueError(f"no FPL fixtures for matchweek {mw}")
    started = mwf[mwf["started"].fillna(False).astype(bool) | (mwf["kickoff_utc"] <= now_utc)]
    if not started.empty:
        raise RuntimeError(f"matchweek {mw} already has started matches: {list(started['match_id'])}")
    return mwf[["match_id", "season", "home", "away", "kickoff_utc"]]


def poisson_rows(matches: pd.DataFrame, mwf: pd.DataFrame, module, now: pd.Timestamp) -> pd.DataFrame:
    """Live Poisson predictions: fit on matches before today (UTC), with expected goals."""
    p = module.ACCEPTED
    probs, lam, mu, _ = pc.predict_fixtures(matches, mwf, p, now.tz_localize(None).normalize())
    rows = to_standard(mwf["match_id"], probs, module.MODEL, p.version(module.MODEL))
    rows["exp_home_goals"], rows["exp_away_goals"] = lam.round(4), mu.round(4)
    return rows


# ---------- 5: market ----------

def parse_fixtures_odds(path: Path) -> pd.DataFrame:
    """football-data fixtures.csv -> Premier League rows with match_id, UTC kickoff and odds."""
    raw = pd.read_csv(path, encoding="utf-8-sig")
    raw = raw[raw["Div"] == "E0"]
    if raw.empty:
        return pd.DataFrame(columns=["match_id", "fd_kickoff_utc", *ODDS_COLS])
    out = pd.DataFrame({"season": SEASON,
                        "home": to_canonical(raw["HomeTeam"], "football_data"),
                        "away": to_canonical(raw["AwayTeam"], "football_data"),
                        "fd_kickoff_utc": uk_local_to_utc(raw["Date"], raw["Time"])})
    out["match_id"] = make_match_id(out)
    for col, fd_col in ODDS_COLS.items():
        out[col] = raw[fd_col].astype(float).to_numpy()
    return out[["match_id", "fd_kickoff_utc", *ODDS_COLS]].reset_index(drop=True)


def market_rows(mwf: pd.DataFrame, odds: pd.DataFrame, collected_at: str, source: Path) -> pd.DataFrame:
    """Join the odds to the matchweek and turn average pre-match odds into probabilities."""
    joined = mwf.merge(odds, on="match_id", how="inner").dropna(subset=["avg_h", "avg_d", "avg_a"])
    if joined.empty:
        return pd.DataFrame()
    gap = (joined["fd_kickoff_utc"] - joined["kickoff_utc"]).abs()
    for _, r in joined[gap > pd.Timedelta(0)].iterrows():
        print(f"WARNING: kickoff differs for {r['match_id']}: FPL {r['kickoff_utc']}, "
              f"football-data {r['fd_kickoff_utc']}")
    probs = market.remove_margin(market.implied(joined[["avg_h", "avg_d", "avg_a"]]))
    rows = to_standard(joined["match_id"], probs, "market", MARKET_VERSION)
    rows["created_at_utc"] = collected_at  # the time the odds were collected
    rows["kickoff_utc"] = joined["kickoff_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ").to_numpy()
    rows["odds_file"] = source.name
    for col in ODDS_COLS:
        rows[col] = joined[col].to_numpy()
    return rows


# ---------- 6: checks and writing ----------

def git_commit() -> str:
    """Short hash of HEAD, with -dirty if anything under src/ is modified or not yet in git."""
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT_DIR,
                          capture_output=True, text=True, check=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain", "src"], cwd=ROOT_DIR,
                           capture_output=True, text=True, check=True).stdout.strip()
    return head + ("-dirty" if dirty else "")


def check_rows(rows: pd.DataFrame, n_expected: int, label: str, strict_count: bool = True) -> None:
    """Probabilities sum to 1, one row per match per model, every timestamp before kickoff.
    With strict_count, every model must cover exactly n_expected matches."""
    sums = rows[PROB_COLS].sum(axis=1)
    if ((sums - 1).abs() > 1e-9).any():
        raise ValueError(f"{label}: probabilities do not sum to 1")
    if rows.duplicated(["match_id", "model", "model_version"]).any():
        raise ValueError(f"{label}: duplicate rows")
    created = pd.to_datetime(rows["created_at_utc"], utc=True)
    kickoff = pd.to_datetime(rows["kickoff_utc"], utc=True)
    late = rows[created >= kickoff]
    if not late.empty:
        raise ValueError(f"{label}: timestamps at or after kickoff: {list(late['match_id'])}")
    per_model = rows.groupby("model")["match_id"].nunique().to_dict()
    if strict_count and any(n != n_expected for n in per_model.values()):
        raise ValueError(f"{label}: matches per model {per_model}, expected {n_expected}")
    print(f"{label}: {len(rows)} rows, matches per model {per_model} (expected {n_expected}), "
          f"max |sum - 1| {(sums - 1).abs().max():.1e}, all created before kickoff "
          f"(earliest margin {(kickoff - created).min()})")


def write(rows: pd.DataFrame, out_dir: Path, name: str, publish: bool) -> Path:
    """Write a file. When publishing, never overwrite a file git already tracks (append-only log)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / name
    if publish and path.exists():
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", str(path)], cwd=ROOT_DIR,
                                 capture_output=True).returncode == 0
        if tracked:
            raise RuntimeError(f"{path.relative_to(ROOT_DIR)} is already committed; predictions are append-only")
        print(f"note: overwriting uncommitted {path.relative_to(ROOT_DIR)}")
    rows.to_csv(path, index=False)
    print(f"wrote {path.relative_to(ROOT_DIR)}")
    return path


def summary_table(mwf: pd.DataFrame, preds: pd.DataFrame, mkt: pd.DataFrame) -> pd.DataFrame:
    """One line per match: kickoff and H/D/A for every model (for the terminal)."""
    allp = pd.concat([preds, mkt[preds.columns.intersection(mkt.columns)]] if not mkt.empty else [preds])
    wide = allp.pivot_table(index="match_id", columns="model", values=PROB_COLS)
    out = mwf[["match_id", "kickoff_utc", "home", "away"]].set_index("match_id")
    for model in sorted(allp["model"].unique()):
        out[model] = [" ".join(f"{wide.loc[m, (c, model)]:.2f}" if (c, model) in wide.columns
                               and not np.isnan(wide.loc[m, (c, model)]) else " -  " for c in PROB_COLS)
                      for m in out.index]
    out["kickoff_utc"] = out["kickoff_utc"].dt.strftime("%a %d %H:%M")
    return out.reset_index(drop=True)


def run(mw: int, refresh: bool = True, with_market: bool = True, publish: bool = False,
        market_only: bool = False) -> None:
    out_dir = PUBLISH_DIR if publish else DRY_RUN_DIR
    print(f"=== Matchweek {mw}, {'PUBLISH' if publish else 'dry run'}"
          f"{', market only' if market_only else ''}, started {utc_now()} ===\n")
    commit = git_commit()
    if publish and commit.endswith("-dirty"):
        raise RuntimeError("src/ has uncommitted or untracked changes; commit them before --publish "
                           "so git_commit identifies the code that made the predictions")

    warnings = refresh_data() if refresh else ["refresh skipped (--no-refresh)"]
    matches, fixtures = load_matches(), fpl_fixtures()
    now = pd.Timestamp.now(tz="UTC")
    check_no_missing_results(fixtures, matches, now)
    mwf = matchweek_fixtures(fixtures, mw, now)
    print(f"matchweek {mw}: {len(mwf)} fixtures, first kickoff {mwf['kickoff_utc'].min()}\n")

    # 1) compute everything
    elo_rows, ratings = elo.predict_fixtures(matches, mwf)
    preds = pd.concat([baseline.predict_fixtures(matches, mwf), elo_rows,
                       poisson_rows(matches, mwf, poisson_goals, now),
                       poisson_rows(matches, mwf, poisson_xg, now)], ignore_index=True)
    preds = preds.merge(mwf[["match_id", "kickoff_utc"]], on="match_id")
    preds["kickoff_utc"] = preds["kickoff_utc"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    preds["git_commit"] = commit
    preds = preds[PRED_COLS + ["exp_home_goals", "exp_away_goals", "kickoff_utc", "git_commit"]]
    if not market_only:
        check_rows(preds, len(mwf), f"mw{mw:02d}.csv")

    mkt = pd.DataFrame()
    if with_market or market_only:
        try:
            path, collected = download_results.download_fixtures()
            mkt = market_rows(mwf, parse_fixtures_odds(path), collected, path)
        except Exception as e:
            warnings.append(f"market odds failed: {type(e).__name__}: {e}")
            print(f"WARNING: {warnings[-1]}")
        if mkt.empty:
            warnings.append("no Premier League odds for this matchweek in fixtures.csv yet; market file not written")
        else:
            missing = sorted(set(mwf["match_id"]) - set(mkt["match_id"]))
            if missing:
                warnings.append(f"market odds missing for {len(missing)} matches: {missing}")
            mkt["git_commit"] = commit
            check_rows(mkt, len(mwf), f"mw{mw:02d}_market.csv", strict_count=False)
    else:
        warnings.append("market skipped (--skip-market)")

    # 2) then write
    if not market_only:
        write(preds, out_dir, f"mw{mw:02d}.csv", publish)
    if not mkt.empty:
        write(mkt, out_dir, f"mw{mw:02d}_market.csv", publish)

    print("\nElo ratings used:", ", ".join(f"{t} {r:.0f}" for t, r in
                                           sorted(ratings.items(), key=lambda x: -x[1])))
    print("\nPredictions (H D A):")
    print(summary_table(mwf, preds, mkt).to_string(index=False))
    print("\nWarnings:" if warnings else "\nNo warnings.")
    for w in warnings:
        print(f"  - {w}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live predictions for one matchweek.")
    parser.add_argument("--matchweek", type=int, required=True)
    parser.add_argument("--publish", action="store_true", help="write to predictions/ instead of outputs/dry_run/")
    parser.add_argument("--no-refresh", action="store_true", help="skip re-downloading 2026-27 data")
    parser.add_argument("--skip-market", action="store_true", help="skip downloading pre-match odds")
    parser.add_argument("--market-only", action="store_true",
                        help="only log the market odds file (when mwXX.csv is already published)")
    args = parser.parse_args()
    if args.market_only and args.skip_market:
        parser.error("--market-only and --skip-market cannot be combined")
    run(args.matchweek, refresh=not args.no_refresh, with_market=not args.skip_market,
        publish=args.publish, market_only=args.market_only)
