export const MODEL_LABELS: Record<string, string> = {
  market: "Market (closing odds)",
  poisson_xg: "Poisson on xG",
  poisson_goals: "Poisson on goals",
  elo: "Elo",
  baseline: "Baseline",
};

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shorter display name where the canonical one is long. */
export const shortName = (team: string) =>
  ({ "Wolverhampton Wanderers": "Wolves", "Nottingham Forest": "Nott'm Forest" })[team] ?? team;
