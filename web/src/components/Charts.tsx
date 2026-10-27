"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelScore, RacePoint, Standing } from "@/lib/queries";
import { MODEL_LABELS } from "@/lib/format";
import { axisProps, TipBox, useTokens } from "./charts/common";

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
