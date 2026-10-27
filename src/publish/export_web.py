"""Export one season for the web dashboard: matches, predictions, scores, clubs, players.

Reads data/processed/matches.parquet, the raw football-data and Understat
files for the season (extra match stats and players), data/clubs.csv and
outputs/backtest/. Writes web/data/season_<season>.json, which
web/scripts/seed.mjs loads into Postgres. The JSON is not committed
(it holds match data, see .gitignore).

Everything the site shows that needs real maths (log loss, calibration,
expected scorelines) is computed here, not in the browser.

Usage: python -m src.publish.export_web [--season 2526]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import poisson

from src.clean.team_names import to_canonical
from src.clean.times import uk_local_to_utc

ROOT_DIR = Path(__file__).resolve().parents[2]
MATCHES_PATH = ROOT_DIR / "data" / "processed" / "matches.parquet"
CLUBS_PATH = ROOT_DIR / "data" / "clubs.csv"
RAW_DIR = ROOT_DIR / "data" / "raw"
BACKTEST_DIR = ROOT_DIR / "outputs" / "backtest"
OUT_DIR = ROOT_DIR / "web" / "data"

MODELS = ["baseline", "elo", "poisson_goals", "poisson_xg", "market"]
MAIN_MODEL = "poisson_xg"
MATCH_COLS = ["match_id", "date", "home", "away", "home_goals", "away_goals", "home_xg", "away_xg",
              "avg_close_h", "avg_close_d", "avg_close_a", "avg_h", "avg_d", "avg_a"]

# football-data column -> export column
FD_STATS = {
    "HTHG": "ht_home_goals", "HTAG": "ht_away_goals", "Referee": "referee",
    "HS": "home_shots", "AS": "away_shots", "HST": "home_sot", "AST": "away_sot",
    "HF": "home_fouls", "AF": "away_fouls", "HC": "home_corners", "AC": "away_corners",
    "HY": "home_yellows", "AY": "away_yellows", "HR": "home_reds", "AR": "away_reds",
}
# Understat column -> export column
US_STATS = {
    "home_expected_points": "home_xpts", "away_expected_points": "away_xpts",
    "home_np_xg": "home_npxg", "away_np_xg": "away_npxg",
    "home_ppda": "home_ppda", "away_ppda": "away_ppda",
    "home_deep_completions": "home_deep", "away_deep_completions": "away_deep",
}
CALIBRATION_BINS = np.linspace(0, 1, 11)
MAX_GOALS = 5  # scoreline grid is 0..4 plus "5+"
EPS = 1e-15


def load_matches(season: str) -> pd.DataFrame:
    """Matches for one season with a result, sorted by date."""
    m = pd.read_parquet(MATCHES_PATH)
    s = m[(m["season"] == season) & m["home_goals"].notna()].sort_values(["date", "match_id"])
    out = s[MATCH_COLS].copy()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    out["home_goals"] = out["home_goals"].astype(int)
    out["away_goals"] = out["away_goals"].astype(int)
    return out.reset_index(drop=True)


def load_football_data_stats(season: str) -> pd.DataFrame:
    """Half-time score, shots, fouls, corners, cards, referee and UTC kickoff, keyed by home/away."""
    raw = pd.read_csv(RAW_DIR / "football_data" / f"E0_{season}.csv", encoding="latin-1")
    raw = raw.dropna(subset=["HomeTeam", "AwayTeam"])
    out = raw[list(FD_STATS)].rename(columns=FD_STATS)
    out["home"] = to_canonical(raw["HomeTeam"], "football_data")
    out["away"] = to_canonical(raw["AwayTeam"], "football_data")
    out["kickoff_utc"] = uk_local_to_utc(raw["Date"], raw["Time"]).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out


def load_understat_stats(season: str) -> pd.DataFrame:
    """Expected points, non-penalty xG, PPDA and deep completions, keyed by home/away."""
    raw = pd.read_csv(RAW_DIR / "understat" / f"understat_{season}.csv")
    out = raw[list(US_STATS)].rename(columns=US_STATS)
    out["home"] = to_canonical(raw["home_team"], "understat")
    out["away"] = to_canonical(raw["away_team"], "understat")
    return out


def load_predictions(season: str, match_ids: set) -> pd.DataFrame:
    """One row per (match, model) from the backtest files, for the season's matches only."""
    frames = []
    for model in MODELS:
        p = pd.read_csv(BACKTEST_DIR / f"{model}.csv")
        p = p[p["match_id"].str.startswith(season + "_") & p["match_id"].isin(match_ids)]
        frames.append(p[["match_id", "model", "model_version", "p_home", "p_draw", "p_away"]])
    return pd.concat(frames, ignore_index=True)


def load_scores(season: str) -> pd.DataFrame:
    """Scoreboard rows (log loss, Brier, accuracy) for the season."""
    s = pd.read_csv(BACKTEST_DIR / "scores.csv", dtype={"season": str})
    return s[s["season"] == season].reset_index(drop=True)


def load_clubs(teams: set) -> pd.DataFrame:
    """data/clubs.csv rows for the season's teams. Raises if a team is missing."""
    clubs = pd.read_csv(CLUBS_PATH, dtype={"badge_code": str})
    missing = sorted(teams - set(clubs["canonical"]))
    if missing:
        raise ValueError(f"Teams missing from data/clubs.csv: {missing}")
    return clubs[clubs["canonical"].isin(teams)].reset_index(drop=True)


def load_players(season: str) -> pd.DataFrame:
    """Understat season player totals. `teams` lists every club a player appeared for.
    Understat sorts that list alphabetically, not by date, so `team` is set only for
    players who stayed at one club and is empty for those who moved."""
    year = 2000 + int(season[:2])  # Understat names a season by its start year
    data = json.loads((RAW_DIR / "understat" / f"league_1_season_{year}.json").read_text())
    p = pd.DataFrame(data["players"])
    num = ["games", "time", "goals", "assists", "shots", "key_passes", "yellow_cards", "red_cards", "npg"]
    flt = ["xG", "xA", "npxG", "xGChain", "xGBuildup"]
    p[num] = p[num].astype(int)
    p[flt] = p[flt].astype(float).round(2)
    teams = p["team_title"].str.split(",")
    mapped = teams.explode().pipe(lambda s: to_canonical(s, "understat"))
    p["teams"] = mapped.groupby(level=0).agg(lambda s: ", ".join(s))
    p["team"] = mapped.groupby(level=0).agg(lambda s: s.iloc[0] if len(s) == 1 else None)
    return p.rename(columns={
        "id": "player_id", "player_name": "name", "time": "minutes", "xG": "xg", "xA": "xa",
        "npxG": "npxg", "xGChain": "xg_chain", "xGBuildup": "xg_buildup",
        "key_passes": "key_passes", "yellow_cards": "yellows", "red_cards": "reds",
    })[["player_id", "name", "team", "teams", "position", "games", "minutes", "goals", "npg", "xg",
        "npxg", "assists", "xa", "shots", "key_passes", "xg_chain", "xg_buildup", "yellows", "reds"]]


def add_log_loss(matches: pd.DataFrame, preds: pd.DataFrame) -> pd.DataFrame:
    """Add ll_market and ll_model: -ln(probability given to the actual result)."""
    # 0 = home win, 1 = draw, 2 = away win, matching the column order below
    outcome = np.sign(matches["away_goals"] - matches["home_goals"]).to_numpy() + 1
    out = matches.copy()
    for model, col in [("market", "ll_market"), (MAIN_MODEL, "ll_model")]:
        p = preds[preds["model"] == model].set_index("match_id").loc[out["match_id"]]
        p_actual = p[["p_home", "p_draw", "p_away"]].to_numpy()[np.arange(len(out)), outcome]
        out[col] = -np.log(np.clip(p_actual, EPS, 1))
    return out


def calibration(matches: pd.DataFrame, preds: pd.DataFrame) -> pd.DataFrame:
    """For market and the main model: every H/D/A probability binned in tenths, with the
    mean predicted probability and how often that outcome happened. 3 rows per match per model."""
    res = matches.set_index("match_id")
    happened = pd.DataFrame({
        "p_home": res["home_goals"] > res["away_goals"],
        "p_draw": res["home_goals"] == res["away_goals"],
        "p_away": res["home_goals"] < res["away_goals"],
    }).astype(int)
    rows = []
    for model in ["market", MAIN_MODEL]:
        p = preds[preds["model"] == model].set_index("match_id")
        long = p[["p_home", "p_draw", "p_away"]].stack().rename("p").to_frame()
        long["hit"] = happened.stack().reindex(long.index).to_numpy()
        long["bin"] = np.clip(np.digitize(long["p"], CALIBRATION_BINS) - 1, 0, 9)
        g = long.groupby("bin").agg(n=("p", "size"), predicted=("p", "mean"), observed=("hit", "mean"))
        for b, r in g.iterrows():
            rows.append({"model": model, "bin": int(b), "bin_low": CALIBRATION_BINS[b],
                         "bin_high": CALIBRATION_BINS[b + 1], "n": int(r["n"]),
                         "predicted": float(r["predicted"]), "observed": float(r["observed"])})
    return pd.DataFrame(rows)


def scorelines(matches: pd.DataFrame) -> pd.DataFrame:
    """Actual count of each scoreline (0..4 and 5+ per side) against the count the main model
    expected, treating home and away goals as independent Poissons with its expected goals."""
    p = pd.read_csv(BACKTEST_DIR / f"{MAIN_MODEL}.csv").set_index("match_id").loc[matches["match_id"]]
    k = np.arange(MAX_GOALS)

    def probs(lam: np.ndarray) -> np.ndarray:
        """Per match P(goals = 0..4) and P(goals >= 5)."""
        pk = poisson.pmf(k[None, :], lam[:, None])
        return np.hstack([pk, 1 - pk.sum(axis=1, keepdims=True)])

    ph, pa = probs(p["exp_home_goals"].to_numpy()), probs(p["exp_away_goals"].to_numpy())
    expected = np.einsum("mi,mj->ij", ph, pa)
    actual = np.zeros_like(expected)
    for h, a in zip(matches["home_goals"].clip(upper=MAX_GOALS), matches["away_goals"].clip(upper=MAX_GOALS)):
        actual[h, a] += 1
    return pd.DataFrame([
        {"home_goals": h, "away_goals": a, "actual": int(actual[h, a]), "expected": float(expected[h, a])}
        for h in range(MAX_GOALS + 1) for a in range(MAX_GOALS + 1)
    ])


def build(season: str) -> dict:
    """Assemble every table for the season."""
    matches = load_matches(season)
    n = len(matches)
    matches = (matches
               .merge(load_football_data_stats(season), on=["home", "away"], how="left", validate="one_to_one")
               .merge(load_understat_stats(season), on=["home", "away"], how="left", validate="one_to_one"))
    if len(matches) != n:
        raise ValueError("joining match stats changed the row count")
    preds = load_predictions(season, set(matches["match_id"]))
    matches = add_log_loss(matches, preds)
    return {
        "matches": matches,
        "predictions": preds,
        "scores": load_scores(season),
        "clubs": load_clubs(set(matches["home"])),
        "players": load_players(season),
        "calibration": calibration(matches, preds),
        "scorelines": scorelines(matches),
    }


def sanity_checks(t: dict) -> None:
    """Print row counts and ranges; raise on anything that would break the dashboard."""
    m, preds = t["matches"], t["predictions"]
    print(f"matches: {len(m)} rows, {m['date'].min()} to {m['date'].max()}, {m['home'].nunique()} teams")
    print(f"missing values in matches: {int(m.isna().sum().sum())}")
    print(f"goals per match: {(m['home_goals'] + m['away_goals']).mean():.3f}")
    print(f"predictions: {len(preds)} rows, by model: {preds['model'].value_counts().to_dict()}")
    print(f"mean log loss: market {m['ll_market'].mean():.4f}, {MAIN_MODEL} {m['ll_model'].mean():.4f}")
    print(f"clubs: {len(t['clubs'])}, players: {len(t['players'])}, scores: {len(t['scores'])}")
    cal = t["calibration"].groupby("model")["n"].sum().to_dict()
    print(f"calibration probabilities per model: {cal}")
    sl = t["scorelines"]
    print(f"scorelines: actual {sl['actual'].sum()}, expected {sl['expected'].sum():.2f}")

    if m["match_id"].duplicated().any():
        raise ValueError("duplicate match_id in matches")
    if m.isna().any().any():
        raise ValueError(f"missing values after joins: {m.columns[m.isna().any()].tolist()}")
    if not np.allclose(preds[["p_home", "p_draw", "p_away"]].sum(axis=1), 1.0, atol=1e-3):
        raise ValueError("prediction probabilities do not sum to 1")
    if (preds.groupby("model").size() != len(m)).any():
        raise ValueError("a model is missing predictions for some matches")
    if any(v != 3 * len(m) for v in cal.values()):
        raise ValueError("calibration does not cover every probability")
    if not np.isclose(sl["expected"].sum(), len(m)) or sl["actual"].sum() != len(m):
        raise ValueError("scoreline totals do not match the number of matches")
    if t["clubs"][["lat", "lon", "badge_code"]].isna().any().any():
        raise ValueError("a club has no coordinates or badge code")
    movers = int(t["players"]["team"].isna().sum())
    print(f"players who moved clubs mid-season: {movers}")
    player_clubs = set(t["players"]["teams"].str.split(", ").explode())
    if not player_clubs <= set(t["clubs"]["canonical"]):
        raise ValueError("a player belongs to a club outside the season")
    print("all checks passed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2526")
    args = parser.parse_args()

    tables = build(args.season)
    sanity_checks(tables)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"season_{args.season}.json"
    payload = {"season": args.season, **{k: v.to_dict(orient="records") for k, v in tables.items()}}
    out_path.write_text(json.dumps(payload))
    print(f"wrote {out_path.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    main()
