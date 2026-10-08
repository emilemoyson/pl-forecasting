"""Shared engine for the Poisson models (poisson_goals, poisson_xg).

Two rows per match, one per team:
    y_ij ~ Poisson(lambda_ij),  log lambda_ij = c + h * home + att_i + def_j
att_i is team i's attack, def_j is opponent j's defensive weakness (higher
means it concedes more). This is a Poisson GLM with a log link, fitted by
maximum likelihood with three additions:

- ridge penalty on att and def, pulling each team towards a prior mean
  (a Gaussian prior, so the fit is a MAP estimate). This keeps teams with
  few matches (promoted sides early in the season) from blowing up;
- optional weights (time decay, recent matches count more);
- optional non-integer y (an xG / goals blend), a quasi-Poisson fit.

Expected goals for both sides give a scoreline grid (0 to 10 each), which
is summed into home / draw / away. An optional Dixon-Coles factor adjusts
the four low scores (0-0, 1-0, 0-1, 1-1), fitted on actual goals.

Walk-forward: matches are grouped into weekly blocks (Tuesday to Monday).
Each block is predicted from a fit on matches strictly before the block.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar
from scipy.stats import poisson

MAX_GOALS = 10
BLOCK_ANCHOR = pd.Timestamp("2014-08-05")  # a Tuesday


@dataclass(frozen=True)
class PoissonParams:
    window_days: int = 365  # training data: matches within this many days before the block
    ridge: float = 3.0  # penalty on (att - prior)^2 and (def - prior)^2
    promoted_prior: str = "relegated"  # "average" (0) or "relegated" (relegated teams' mean)
    xg_weight: float = 0.0  # y = w * xG + (1 - w) * goals
    half_life_days: float = 0.0  # 0 = no time decay
    dixon_coles: bool = False

    def version(self, name: str) -> str:
        v = f"v1_win{self.window_days}_ridge{self.ridge:g}_{self.promoted_prior}"
        if name != "poisson_goals":
            v += f"_xg{self.xg_weight:g}_hl{self.half_life_days:g}_dc{int(self.dixon_coles)}"
        return v


@dataclass
class PoissonFit:
    c: float
    h: float
    att: dict[str, float]
    dfn: dict[str, float]
    rho: float = 0.0

    def rates(self, home: pd.Series, away: pd.Series) -> tuple[np.ndarray, np.ndarray]:
        """Expected goals for the home and away side of each fixture."""
        a, d = pd.Series(self.att), pd.Series(self.dfn)
        lam = np.exp(self.c + self.h + home.map(a).to_numpy() + away.map(d).to_numpy())
        mu = np.exp(self.c + away.map(a).to_numpy() + home.map(d).to_numpy())
        return lam, mu


# ---------- fitting ----------

def long_format(matches: pd.DataFrame, p: PoissonParams, ref_date: pd.Timestamp) -> pd.DataFrame:
    """Matches -> two rows per match (team, opp, home, y, w)."""
    w = np.ones(len(matches))
    if p.half_life_days > 0:
        age = (ref_date - matches["date"]).dt.days.to_numpy()
        w = 0.5 ** (age / p.half_life_days)
    yh = p.xg_weight * matches["home_xg"] + (1 - p.xg_weight) * matches["home_goals"].astype(float)
    ya = p.xg_weight * matches["away_xg"] + (1 - p.xg_weight) * matches["away_goals"].astype(float)
    return pd.DataFrame({
        "team": np.r_[matches["home"].to_numpy(), matches["away"].to_numpy()],
        "opp": np.r_[matches["away"].to_numpy(), matches["home"].to_numpy()],
        "home": np.r_[np.ones(len(matches)), np.zeros(len(matches))],
        "y": np.r_[yh.to_numpy(), ya.to_numpy()],
        "w": np.r_[w, w],
    })


def fit(train: pd.DataFrame, p: PoissonParams, ref_date: pd.Timestamp, teams: list[str],
        prior: dict[str, tuple[float, float]] | None = None) -> PoissonFit:
    """Penalised (weighted) Poisson MLE. `teams` must include every team to be predicted;
    a team with no training rows ends up exactly at its prior."""
    prior = prior or {}
    teams = sorted(set(teams) | set(train["home"]) | set(train["away"]))
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    lf = long_format(train, p, ref_date)
    ti, oi = lf["team"].map(idx).to_numpy(), lf["opp"].map(idx).to_numpy()
    home, y, w = lf["home"].to_numpy(), lf["y"].to_numpy(), lf["w"].to_numpy()
    mu_a = np.array([prior.get(t, (0.0, 0.0))[0] for t in teams])
    mu_d = np.array([prior.get(t, (0.0, 0.0))[1] for t in teams])

    def objective(theta):
        c, h, a, d = theta[0], theta[1], theta[2:2 + n], theta[2 + n:]
        eta = c + h * home + a[ti] + d[oi]
        lam = np.exp(eta)
        nll = -np.sum(w * (y * eta - lam))
        pen = p.ridge * (np.sum((a - mu_a) ** 2) + np.sum((d - mu_d) ** 2))
        r = w * (y - lam)
        grad = np.empty_like(theta)
        grad[0] = -r.sum()
        grad[1] = -(r * home).sum()
        grad[2:2 + n] = -np.bincount(ti, weights=r, minlength=n) + 2 * p.ridge * (a - mu_a)
        grad[2 + n:] = -np.bincount(oi, weights=r, minlength=n) + 2 * p.ridge * (d - mu_d)
        return nll + pen, grad

    y_bar = np.average(y, weights=w) if len(y) else 1.3
    theta0 = np.r_[np.log(max(y_bar, 0.1)), 0.2, mu_a, mu_d]
    res = minimize(objective, theta0, jac=True, method="L-BFGS-B")
    if not res.success:
        raise RuntimeError(f"Poisson fit did not converge: {res.message}")
    th = res.x
    out = PoissonFit(c=th[0], h=th[1], att=dict(zip(teams, th[2:2 + n])), dfn=dict(zip(teams, th[2 + n:])))
    if p.dixon_coles and len(train):
        out.rho = fit_rho(train, out, p, ref_date)
    return out


def dc_tau(hg: np.ndarray, ag: np.ndarray, lam: np.ndarray, mu: np.ndarray, rho: float) -> np.ndarray:
    """Dixon-Coles adjustment for the four low scores; 1 elsewhere."""
    tau = np.ones(len(hg))
    tau = np.where((hg == 0) & (ag == 0), 1 - lam * mu * rho, tau)
    tau = np.where((hg == 0) & (ag == 1), 1 + lam * rho, tau)
    tau = np.where((hg == 1) & (ag == 0), 1 + mu * rho, tau)
    tau = np.where((hg == 1) & (ag == 1), 1 - rho, tau)
    return tau


def fit_rho(train: pd.DataFrame, f: PoissonFit, p: PoissonParams, ref_date: pd.Timestamp) -> float:
    """MLE of the Dixon-Coles rho on actual goals, holding the expected goals fixed."""
    lam, mu = f.rates(train["home"], train["away"])
    hg, ag = train["home_goals"].to_numpy(int), train["away_goals"].to_numpy(int)
    w = (0.5 ** ((ref_date - train["date"]).dt.days.to_numpy() / p.half_life_days)
         if p.half_life_days > 0 else np.ones(len(train)))
    # keep every tau positive: 1 - lam*mu*rho > 0, 1 + lam*rho > 0, 1 + mu*rho > 0, 1 - rho > 0
    hi = min(1.0, 1 / np.max(lam * mu)) - 1e-6
    lo = max(-1 / np.max(lam), -1 / np.max(mu)) + 1e-6

    def nll(rho):
        return -np.sum(w * np.log(dc_tau(hg, ag, lam, mu, rho)))

    return float(minimize_scalar(nll, bounds=(lo, hi), method="bounded").x)


# ---------- probabilities ----------

def hda_from_rates(lam: np.ndarray, mu: np.ndarray, rho: float = 0.0) -> np.ndarray:
    """Expected goals -> n x 3 home/draw/away probabilities via the 0-10 scoreline grid."""
    g = np.arange(MAX_GOALS + 1)
    ph = poisson.pmf(g[None, :], lam[:, None])  # n x 11
    pa = poisson.pmf(g[None, :], mu[:, None])
    grid = ph[:, :, None] * pa[:, None, :]  # n x home goals x away goals
    if rho:
        grid[:, 0, 0] *= 1 - lam * mu * rho
        grid[:, 0, 1] *= 1 + lam * rho
        grid[:, 1, 0] *= 1 + mu * rho
        grid[:, 1, 1] *= 1 - rho
    grid /= grid.sum(axis=(1, 2), keepdims=True)  # mass beyond 10 goals is negligible
    home = np.tril(np.ones((MAX_GOALS + 1, MAX_GOALS + 1)), -1)  # home goals > away goals
    p_home = (grid * home[None]).sum(axis=(1, 2))
    p_draw = np.trace(grid, axis1=1, axis2=2)
    return np.c_[p_home, p_draw, 1 - p_home - p_draw]


def scoreline_grid(lam: float, mu: float, rho: float = 0.0, max_goals: int = 5) -> pd.DataFrame:
    """One fixture's scoreline probabilities (rows home goals, columns away goals), for the notes."""
    g = np.arange(MAX_GOALS + 1)
    grid = np.outer(poisson.pmf(g, lam), poisson.pmf(g, mu))
    if rho:
        grid[0, 0] *= 1 - lam * mu * rho
        grid[0, 1] *= 1 + lam * rho
        grid[1, 0] *= 1 + mu * rho
        grid[1, 1] *= 1 - rho
    grid /= grid.sum()
    return pd.DataFrame(grid[:max_goals + 1, :max_goals + 1])


# ---------- walk-forward ----------

def weekly_block(dates: pd.Series) -> pd.Series:
    """Tuesday-to-Monday week number. A whole matchweek (incl. Monday games) shares one fit."""
    return ((dates - BLOCK_ANCHOR).dt.days // 7).astype(int)


def season_teams(matches: pd.DataFrame) -> dict[str, set[str]]:
    return {s: set(g["home"]) | set(g["away"]) for s, g in matches.groupby("season")}


def promoted_prior(matches: pd.DataFrame, season: str, p: PoissonParams) -> dict[str, tuple[float, float]]:
    """Prior means for the season's promoted teams. 'average' = 0 (league average);
    'relegated' = mean att/def of the teams that went down, from a fit just before the season."""
    teams = season_teams(matches)
    seasons = sorted(teams)
    i = seasons.index(season)
    if i == 0:
        return {}
    promoted = teams[season] - teams[seasons[i - 1]]
    relegated = teams[seasons[i - 1]] - teams[season]
    if p.promoted_prior == "average" or not promoted:
        return {}
    start = matches.loc[matches["season"] == season, "date"].min()
    train = matches[(matches["date"] < start) & (matches["date"] >= start - pd.Timedelta(days=p.window_days))]
    f = fit(train, replace(p, dixon_coles=False), start, sorted(teams[seasons[i - 1]]))
    a = float(np.mean([f.att[t] for t in relegated]))
    d = float(np.mean([f.dfn[t] for t in relegated]))
    return {t: (a, d) for t in promoted}


def walk_forward(matches: pd.DataFrame, seasons: list[str], p: PoissonParams) -> pd.DataFrame:
    """Predict every played match of `seasons` week by week. Returns match_id, season and p_home/draw/away.

    Each weekly block is predicted from a fit on matches strictly before the block's first day.
    """
    played = matches.dropna(subset=["home_goals", "away_goals"]).copy()
    played["block"] = weekly_block(played["date"])
    out = []
    for season in seasons:
        prior = promoted_prior(played, season, p)
        target = played[played["season"] == season]
        for block, games in target.groupby("block", sort=True):
            start = BLOCK_ANCHOR + pd.Timedelta(days=7 * int(block))
            train = played[(played["date"] < start) & (played["date"] >= start - pd.Timedelta(days=p.window_days))]
            f = fit(train, p, start, sorted(set(games["home"]) | set(games["away"])), prior)
            lam, mu = f.rates(games["home"], games["away"])
            probs = hda_from_rates(lam, mu, f.rho)
            out.append(pd.DataFrame({"match_id": games["match_id"].to_numpy(), "season": season,
                                     "p_home": probs[:, 0], "p_draw": probs[:, 1], "p_away": probs[:, 2],
                                     "exp_home_goals": lam, "exp_away_goals": mu,
                                     "outcome": np.select([games["home_goals"] > games["away_goals"],
                                                           games["home_goals"] == games["away_goals"]],
                                                          [0, 1], 2)}))
    return pd.concat(out, ignore_index=True)


def log_loss(pred: pd.DataFrame) -> float:
    probs = pred[["p_home", "p_draw", "p_away"]].to_numpy()
    p_actual = probs[np.arange(len(pred)), pred["outcome"].to_numpy()]
    return float(-np.log(np.clip(p_actual, 1e-15, 1)).mean())


def predict_fixtures(matches: pd.DataFrame, fixtures: pd.DataFrame, p: PoissonParams,
                     ref_date: pd.Timestamp) -> tuple[np.ndarray, np.ndarray, np.ndarray, PoissonFit]:
    """Live: fit on played matches before ref_date, predict fixtures (one season).
    Returns H/D/A probabilities, expected home and away goals, and the fit."""
    played = matches.dropna(subset=["home_goals", "away_goals"])
    played = played[played["date"] < ref_date]
    season = fixtures["season"].iloc[0]
    prior = promoted_prior(pd.concat([played, fixtures.assign(date=ref_date)], ignore_index=True)
                           if season not in set(played["season"]) else played, season, p)
    train = played[played["date"] >= ref_date - pd.Timedelta(days=p.window_days)]
    f = fit(train, p, ref_date, sorted(set(fixtures["home"]) | set(fixtures["away"])), prior)
    lam, mu = f.rates(fixtures["home"], fixtures["away"])
    return hda_from_rates(lam, mu, f.rho), lam, mu, f
