"""Score H/D/A predictions against results: log loss, Brier, accuracy, calibration.

Takes any predictions file in the standard format (match_id, model,
model_version, created_at_utc, p_home, p_draw, p_away) plus
data/processed/matches.parquet. Only matches with a result are scored.

Usage: python -m src.evaluate.scoreboard path/to/predictions.csv [--by-season]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT_DIR = Path(__file__).resolve().parents[2]
MATCHES_PATH = ROOT_DIR / "data" / "processed" / "matches.parquet"
OUT_DIR = ROOT_DIR / "outputs"

PRED_COLS = ["match_id", "model", "model_version", "created_at_utc", "p_home", "p_draw", "p_away"]
PROB_COLS = ["p_home", "p_draw", "p_away"]
OUTCOMES = ["home", "draw", "away"]  # index 0, 1, 2 matches PROB_COLS
EPS = 1e-15  # floor for log(p) so a 0 on the actual result gives a large, finite loss

# Fixed colour per model (the model ladder order), so a model keeps its colour on every chart.
MODEL_COLORS = {
    "baseline": "#2a78d6", "elo": "#eb6834", "poisson_goals": "#1baf7a", "poisson_xg": "#eda100",
    "dixon_coles": "#e87ba4", "state_space": "#008300", "market": "#e34948",
}


def check_predictions(preds: pd.DataFrame, tol: float = 1e-3) -> None:
    """Raise if columns are missing, probabilities are outside [0, 1] or don't sum to 1."""
    missing = [c for c in PRED_COLS if c not in preds.columns]
    if missing:
        raise ValueError(f"predictions missing columns: {missing}")
    p = preds[PROB_COLS]
    if p.isna().any().any():
        raise ValueError("predictions contain missing probabilities")
    if ((p < 0) | (p > 1)).any().any():
        raise ValueError("probabilities outside [0, 1]")
    bad = (p.sum(axis=1) - 1).abs() > tol
    if bad.any():
        raise ValueError(f"{int(bad.sum())} rows where probabilities do not sum to 1")
    if preds.duplicated(["match_id", "model", "model_version"]).any():
        raise ValueError("duplicate match_id / model / model_version rows")


def outcome_index(home_goals: pd.Series, away_goals: pd.Series) -> np.ndarray:
    """Goals -> result index: 0 home win, 1 draw, 2 away win."""
    return np.select([home_goals > away_goals, home_goals == away_goals], [0, 1], default=2)


def attach_results(preds: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """Add season and the result index to each prediction. Drops matches without a result."""
    played = matches.dropna(subset=["home_goals", "away_goals"])
    out = preds.merge(played[["match_id", "season", "home_goals", "away_goals"]], on="match_id", how="inner")
    out["outcome"] = outcome_index(out["home_goals"], out["away_goals"])
    return out


def log_loss(probs: np.ndarray, outcome: np.ndarray) -> float:
    """Mean of -log(probability given to the actual result). Uniform 1/3 gives ln 3 = 1.0986."""
    p_actual = probs[np.arange(len(outcome)), outcome]
    return float(-np.log(np.clip(p_actual, EPS, 1)).mean())


def brier(probs: np.ndarray, outcome: np.ndarray) -> float:
    """Multi-class Brier: mean over matches of the sum over H/D/A of (p - actual)^2. Range 0 to 2."""
    actual = np.eye(3)[outcome]
    return float(((probs - actual) ** 2).sum(axis=1).mean())


def accuracy(probs: np.ndarray, outcome: np.ndarray) -> float:
    """Share of matches where the most likely outcome happened (ties go to home, then draw)."""
    return float((probs.argmax(axis=1) == outcome).mean())


def score(scored: pd.DataFrame, by: list[str] | None = None) -> pd.DataFrame:
    """Scores per group from attach_results output. Default groups by model and model_version,
    so two versions of the same model are never pooled."""
    by = by or ["model", "model_version"]
    rows = []
    for key, g in scored.groupby(by, sort=True):
        probs, y = g[PROB_COLS].to_numpy(), g["outcome"].to_numpy()
        key = key if isinstance(key, tuple) else (key,)
        rows.append({**dict(zip(by, key)), "n": len(g), "log_loss": log_loss(probs, y),
                     "brier": brier(probs, y), "accuracy": accuracy(probs, y)})
    return pd.DataFrame(rows)


def calibration_table(scored: pd.DataFrame, n_bins: int = 10) -> pd.DataFrame:
    """Pool every (match, outcome) pair, bin by predicted probability (10 equal bins),
    and compare the mean prediction with how often that outcome happened."""
    rows = []
    for (model, version), g in scored.groupby(["model", "model_version"], sort=True):
        p = g[PROB_COLS].to_numpy().ravel()
        hit = np.eye(3)[g["outcome"].to_numpy()].ravel()
        bins = np.minimum((p * n_bins).astype(int), n_bins - 1)
        for b in range(n_bins):
            m = bins == b
            if m.any():
                rows.append({"model": model, "model_version": version, "bin": b, "bin_low": b / n_bins, "bin_high": (b + 1) / n_bins,
                             "n": int(m.sum()), "mean_pred": p[m].mean(), "observed": hit[m].mean()})
    return pd.DataFrame(rows)


def plot_calibration(calib: pd.DataFrame, out_path: Path, title: str = "Calibration") -> Path:
    """Save a reliability chart: mean predicted probability vs observed frequency per bin."""
    fig, ax = plt.subplots(figsize=(6, 6), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    ax.plot([0, 1], [0, 1], color="#b5b4ad", linewidth=1, linestyle="--", label="perfect calibration")
    multi_version = calib.groupby("model")["model_version"].nunique().gt(1).any()
    for i, ((model, version), g) in enumerate(calib.groupby(["model", "model_version"], sort=True)):
        color = MODEL_COLORS.get(model, list(MODEL_COLORS.values())[i % len(MODEL_COLORS)])
        ax.plot(g["mean_pred"], g["observed"], color=color, linewidth=2, marker="o", markersize=5,
                markeredgecolor="#fcfcfb", markeredgewidth=1.5,
                label=f"{model} {version}" if multi_version else model)
    ax.set(xlim=(0, 1), ylim=(0, 1), xlabel="Predicted probability", ylabel="Observed frequency", title=title)
    ax.grid(color="#e7e6e0", linewidth=0.8)
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    for side in ["left", "bottom"]:
        ax.spines[side].set_color("#b5b4ad")
    ax.tick_params(colors="#5d5c57")
    ax.legend(frameon=False, loc="upper left")
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    return out_path


def run(preds_path: Path, by_season: bool = False) -> pd.DataFrame:
    """Score one predictions file, print the table and sanity checks, save the calibration chart."""
    preds = pd.read_csv(preds_path)
    check_predictions(preds)
    scored = attach_results(preds, pd.read_parquet(MATCHES_PATH))
    print(f"predictions: {len(preds)} rows, scored (match has a result): {len(scored)}, "
          f"not yet played or unknown match_id: {len(preds) - len(scored)}")
    table = score(scored, ["model", "model_version", "season"] if by_season else None)
    print(table.round(4).to_string(index=False))
    calib = calibration_table(scored)
    out = plot_calibration(calib, OUT_DIR / f"calibration_{preds_path.stem}.png",
                           title=f"Calibration: {preds_path.stem}")
    print(f"calibration chart: {out.relative_to(ROOT_DIR)}")
    return table


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--by-season", action="store_true")
    args = parser.parse_args()
    run(args.predictions, args.by_season)
