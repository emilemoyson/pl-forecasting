"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelScore, RacePoint, Standing } from "@/lib/queries";
import { MODEL_LABELS } from "@/lib/format";

// Recharts writes colors into SVG attributes, so read the CSS tokens once and
// again whenever the OS theme flips. Defaults are the light values for SSR.
const TOKEN_NAMES = [
  "surface", "text-primary", "text-secondary", "text-muted", "grid", "axis", "border",
  "series-1", "series-2", "series-3", "series-4", "neutral-mark", "diverge-pos", "diverge-neg",
] as const;
type Tokens = Record<(typeof TOKEN_NAMES)[number], string>;
const LIGHT: Tokens = {
  surface: "#fcfcfb", "text-primary": "#0b0b0b", "text-secondary": "#52514e", "text-muted": "#898781",
  grid: "#e1e0d9", axis: "#c3c2b7", border: "rgba(11,11,11,0.1)", "series-1": "#2a78d6",
  "series-2": "#eb6834", "series-3": "#1baf7a", "series-4": "#eda100", "neutral-mark": "#c3c2b7",
  "diverge-pos": "#2a78d6", "diverge-neg": "#e34948",
};

function useTokens(): Tokens {
  const [tokens, setTokens] = useState<Tokens>(LIGHT);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next = { ...LIGHT };
      for (const name of TOKEN_NAMES) next[name] = style.getPropertyValue(`--${name}`).trim() || LIGHT[name];
      setTokens(next);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return tokens;
}

function axisProps(t: Tokens) {
  return {
    stroke: t.axis,
    tick: { fill: t["text-muted"], fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: t.axis },
  };
}

type TipRow = { label: string; value: string; color?: string };

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-sm">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const ROW_H = 24;

/** Final points per team, league order. */
export function PointsChart({ standings }: { standings: Standing[] }) {
  const t = useTokens();
  return (
    <div style={{ height: standings.length * ROW_H + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={standings} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" {...axisProps(t)} />
          <YAxis type="category" dataKey="team" width={160} interval={0} {...axisProps(t)}
                 tick={{ fill: t["text-secondary"], fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: t.border }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const s = payload[0].payload as Standing;
              return (
                <TipBox title={`${s.rank}. ${s.team}`} rows={[
                  { label: "Points", value: String(s.points) },
                  { label: "W-D-L", value: `${s.won}-${s.drawn}-${s.lost}` },
                  { label: "Goal difference", value: s.gd > 0 ? `+${s.gd}` : String(s.gd) },
                ]} />
              );
            }}
          />
          <Bar dataKey="points" fill={t["series-1"]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const RACE_COLORS = ["series-1", "series-2", "series-3", "series-4"] as const;

/** Cumulative points by game played for the top teams. */
export function RaceChart({ race, teams }: { race: RacePoint[]; teams: string[] }) {
  const t = useTokens();
  const byGame = new Map<number, Record<string, number>>();
  for (const p of race) {
    const row = byGame.get(p.game) ?? { game: p.game };
    row[p.team] = p.points;
    byGame.set(p.game, row);
  }
  const data = [...byGame.values()].sort((a, b) => a.game - b.game);
  const last = data.length - 1;
  const color = (i: number) => t[RACE_COLORS[i]];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {teams.map((team, i) => (
          <span key={team} className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 rounded" style={{ background: color(i) }} />
            {team}
          </span>
        ))}
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 44, bottom: 16, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="game" type="number" domain={[1, data.length]} ticks={[1, 5, 10, 15, 20, 25, 30, 35, 38]}
                   {...axisProps(t)}
                   label={{ value: "Games played", position: "insideBottom", offset: -10, fill: t["text-muted"], fontSize: 12 }} />
            <YAxis width={36} {...axisProps(t)} />
            <Tooltip
              cursor={{ stroke: t.axis }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = [...payload]
                  .sort((a, b) => Number(b.value) - Number(a.value))
                  .map((p) => ({ label: String(p.dataKey), value: `${p.value} pts`, color: p.color }));
                return <TipBox title={`After game ${label}`} rows={rows} />;
              }}
            />
            {teams.map((team, i) => (
              <Line key={team} dataKey={team} stroke={color(i)} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} isAnimationActive={false}>
                <LabelList
                  dataKey={team}
                  content={({ x, y, value, index }) =>
                    index === last ? (
                      <text x={Number(x) + 6} y={Number(y) + 4} fontSize={12} fill={t["text-secondary"]}>{value}</text>
                    ) : null
                  }
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Goal difference minus xG difference for each team: results better or worse than chance quality.
 * Using differences cancels the league-wide gap between total goals and total xG. */
export function FinishingChart({ standings }: { standings: Standing[] }) {
  const t = useTokens();
  const data = standings
    .map((s) => {
      const xgd = Math.round((s.xgf - s.xga) * 10) / 10;
      return { team: s.team, gd: s.gd, xgd, diff: Math.round((s.gd - xgd) * 10) / 10 };
    })
    .sort((a, b) => b.diff - a.diff);
  const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
  return (
    <div style={{ height: data.length * ROW_H + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" {...axisProps(t)} />
          <YAxis type="category" dataKey="team" width={160} interval={0} {...axisProps(t)}
                 tick={{ fill: t["text-secondary"], fontSize: 12 }} />
          <ReferenceLine x={0} stroke={t.axis} />
          <Tooltip
            cursor={{ fill: t.border }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TipBox title={d.team} rows={[
                  { label: "Goal difference", value: d.gd > 0 ? `+${d.gd}` : String(d.gd) },
                  { label: "xG difference", value: fmt(d.xgd) },
                  { label: "Over / under", value: fmt(d.diff) },
                ]} />
              );
            }}
          />
          <Bar dataKey="diff" radius={4} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.team} fill={d.diff >= 0 ? t["diverge-pos"] : t["diverge-neg"]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Each model's log loss minus the market's. Zero would mean matching the market. */
export function ModelGapChart({ scores }: { scores: ModelScore[] }) {
  const t = useTokens();
  const market = scores.find((s) => s.model === "market");
  if (!market) return null;
  const data = scores
    .filter((s) => s.model !== "market")
    .map((s) => ({ model: s.model, label: MODEL_LABELS[s.model] ?? s.model, gap: s.logLoss - market.logLoss, logLoss: s.logLoss }))
    .sort((a, b) => a.gap - b.gap);
  return (
    <div style={{ height: data.length * 40 + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" {...axisProps(t)} tickFormatter={(v: number) => v.toFixed(2)} />
          <YAxis type="category" dataKey="label" width={160} interval={0} {...axisProps(t)}
                 tick={{ fill: t["text-secondary"], fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: t.border }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TipBox title={d.label} rows={[
                  { label: "Log loss", value: d.logLoss.toFixed(4) },
                  { label: "Market log loss", value: market.logLoss.toFixed(4) },
                  { label: "Gap to market", value: `+${d.gap.toFixed(4)}` },
                ]} />
              );
            }}
          />
          <Bar dataKey="gap" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.model} fill={d.model === "poisson_xg" ? t["series-1"] : t["neutral-mark"]} />
            ))}
            <LabelList dataKey="gap" position="right" fontSize={12} fill={t["text-secondary"]}
                       formatter={(v: number) => `+${v.toFixed(3)}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
