"use client";

import { useState } from "react";
import type { CalibrationBin, Club, Scoreline, TeamProfile, Upset } from "@/lib/queries";
import { shortName, formatDate, MODEL_LABELS } from "@/lib/format";
import { Crest, crestUrl } from "../Crest";
import { useTokens } from "./common";

type ClubIndex = Record<string, Club>;

// The main model keeps slot 1 (as in the model gap chart), the market takes slot 2.
const SERIES = [
  { model: "poisson_xg", token: "series-1" },
  { model: "market", token: "series-2" },
] as const;

// ---------------------------------------------------------------------------
// Calibration: when a forecast said p, did it happen p of the time?

export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const t = useTokens();
  const [hover, setHover] = useState<CalibrationBin | null>(null);
  const W = 520, H = 440, P = { top: 16, right: 20, bottom: 44, left: 48 };
  const x = (v: number) => P.left + v * (W - P.left - P.right);
  const y = (v: number) => H - P.bottom - v * (H - P.top - P.bottom);
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const maxN = Math.max(...bins.map((b) => b.n));
  const r = (n: number) => 3 + 6 * Math.sqrt(n / maxN);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        {SERIES.map((s) => (
          <span key={s.model} className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4" style={{ background: t[s.token] }} />{MODEL_LABELS[s.model]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-4" style={{ background: t.axis }} />Perfect calibration
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[560px]" role="img"
           aria-label="Calibration: forecast probability against how often the outcome happened" onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={x(tk)} x2={x(tk)} y1={P.top} y2={H - P.bottom} stroke={t.grid} />
            <line x1={P.left} x2={W - P.right} y1={y(tk)} y2={y(tk)} stroke={t.grid} />
            <text x={x(tk)} y={H - P.bottom + 16} fontSize={11} textAnchor="middle" fill={t["text-muted"]}>{tk * 100}%</text>
            <text x={P.left - 8} y={y(tk) + 4} fontSize={11} textAnchor="end" fill={t["text-muted"]}>{tk * 100}%</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke={t.axis} strokeWidth={1.5} />
        <text x={(P.left + W - P.right) / 2} y={H - 6} fontSize={12} textAnchor="middle" fill={t["text-secondary"]}>Forecast probability</text>
        <text transform={`translate(12, ${(P.top + H - P.bottom) / 2}) rotate(-90)`} fontSize={12} textAnchor="middle"
              fill={t["text-secondary"]}>How often it happened</text>
        {SERIES.map((s) => {
          const rows = bins.filter((b) => b.model === s.model);
          const d = rows.map((b, i) => `${i ? "L" : "M"}${x(b.predicted)},${y(b.observed)}`).join("");
          return (
            <g key={s.model}>
              <path d={d} fill="none" stroke={t[s.token]} strokeWidth={2} />
              {rows.map((b) => (
                <g key={b.bin} onMouseEnter={() => setHover(b)}>
                  <circle cx={x(b.predicted)} cy={y(b.observed)} r={12} fill="transparent" />
                  <circle cx={x(b.predicted)} cy={y(b.observed)} r={r(b.n)} fill={t[s.token]} stroke={t.surface} strokeWidth={2} />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 min-h-[20px] text-[13px] text-ink-2" aria-live="polite">
        {hover ? (
          <><strong className="text-ink">{MODEL_LABELS[hover.model]}</strong>: {hover.n} forecasts between{" "}
            {hover.bin * 10}% and {hover.bin * 10 + 10}%, averaging {(hover.predicted * 100).toFixed(1)}%. They came true{" "}
            {(hover.observed * 100).toFixed(1)}% of the time.</>
        ) : "Each dot groups forecasts in a 10-point band; bigger dots hold more forecasts. On the diagonal is perfect."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upset gallery

export function UpsetGallery({ upsets, clubs }: { upsets: Upset[]; clubs: ClubIndex }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {upsets.map((u) => {
        const winner = u.result === "H" ? u.home : u.result === "A" ? u.away : null;
        return (
          <div key={u.matchId} className="rounded-lg border border-line p-3">
            <div className="text-[12px] text-muted">{formatDate(u.date)}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className={`flex min-w-0 flex-1 flex-col items-center gap-1 text-center ${winner === u.home ? "" : "opacity-60"}`}>
                <Crest badgeCode={clubs[u.home].badgeCode} code={clubs[u.home].code} team={u.home} size={36} />
                <span className="truncate text-[12px] text-ink-2">{clubs[u.home].code}</span>
              </div>
              <div className="tabular text-[22px] font-semibold text-ink">{u.homeGoals}-{u.awayGoals}</div>
              <div className={`flex min-w-0 flex-1 flex-col items-center gap-1 text-center ${winner === u.away ? "" : "opacity-60"}`}>
                <Crest badgeCode={clubs[u.away].badgeCode} code={clubs[u.away].code} team={u.away} size={36} />
                <span className="truncate text-[12px] text-ink-2">{clubs[u.away].code}</span>
              </div>
            </div>
            <div className="mt-3 text-[13px] text-ink">
              Market gave this <strong>{(u.marketP * 100).toFixed(0)}%</strong>
            </div>
            <div className="text-[12px] text-ink-2">
              Model gave it {(u.modelP * 100).toFixed(0)}% · xG {u.homeXg.toFixed(1)}-{u.awayXg.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model against market, by team

export function TeamEdgeChart({ profiles, clubs }: { profiles: TeamProfile[]; clubs: ClubIndex }) {
  const t = useTokens();
  const rows = [...profiles].sort((a, b) => a.llGap - b.llGap);
  const W = 600, LEFT = 150, RIGHT = 56, ROWH = 24, TOP = 22;
  const H = TOP + rows.length * ROWH + 26;
  const ext = Math.max(...rows.map((r) => Math.abs(r.llGap)));
  const mid = LEFT + (W - LEFT - RIGHT) / 2;
  const x = (v: number) => mid + (v / ext) * ((W - LEFT - RIGHT) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Log loss of the model minus the market, per team">
      <text x={mid - 8} y={12} fontSize={11} textAnchor="end" fill={t["text-muted"]}>← model read them better</text>
      <text x={mid + 8} y={12} fontSize={11} fill={t["text-muted"]}>market read them better →</text>
      {rows.map((p, i) => {
        const cy = TOP + i * ROWH + ROWH / 2;
        const v = p.llGap;
        return (
          <g key={p.team}>
            <title>{`${p.team}: model log loss ${v > 0 ? "higher" : "lower"} than the market by ${Math.abs(v).toFixed(3)} per match`}</title>
            <image href={crestUrl(clubs[p.team].badgeCode)} x={4} y={cy - 9} width={18} height={18} />
            <text x={28} y={cy + 4} fontSize={12} fill={t["text-secondary"]}>{shortName(p.team)}</text>
            <rect x={Math.min(x(0), x(v))} y={cy - 8} width={Math.abs(x(v) - x(0))} height={16} rx={3}
                  fill={v <= 0 ? t["diverge-pos"] : t["diverge-neg"]} />
            <text x={v <= 0 ? x(v) - 6 : x(v) + 6} y={cy + 4} fontSize={11} textAnchor={v <= 0 ? "end" : "start"}
                  fill={t["text-secondary"]} className="tabular">{Math.abs(v) < 0.0005 ? "0.000" : `${v > 0 ? "+" : ""}${v.toFixed(3)}`}</text>
          </g>
        );
      })}
      <line x1={mid} x2={mid} y1={TOP - 4} y2={H - 20} stroke={t.axis} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Scorelines: what happened against what the model expected

export function ScorelineHeatmap({ cells }: { cells: Scoreline[] }) {
  const max = Math.max(...cells.map((c) => Math.abs(c.actual - c.expected)));
  const n = Math.max(...cells.map((c) => c.homeGoals)) + 1;
  const lab = (g: number) => (g === n - 1 ? `${g}+` : String(g));
  const bg = (d: number) => {
    const pct = Math.round((Math.abs(d) / max) * 70);
    return `color-mix(in srgb, var(${d >= 0 ? "--diverge-pos" : "--diverge-neg"}) ${pct}%, transparent)`;
  };
  const top = [...cells].sort((a, b) => b.actual - a.actual)[0];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: bg(max) }} />Happened more often than predicted</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: bg(-max) }} />Less often</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate text-[12px]" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="pr-2 text-right text-[11px] font-normal text-muted">Home \ Away</th>
              {Array.from({ length: n }, (_, a) => (
                <th key={a} scope="col" className="w-16 text-center font-medium text-ink-2">{lab(a)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, h) => (
              <tr key={h}>
                <th scope="row" className="pr-2 text-right font-medium text-ink-2">{lab(h)}</th>
                {Array.from({ length: n }, (_, a) => {
                  const c = cells.find((x) => x.homeGoals === h && x.awayGoals === a)!;
                  const d = c.actual - c.expected;
                  return (
                    <td key={a} className="tabular h-14 w-16 rounded text-center align-middle" style={{ background: bg(d) }}
                        title={`${lab(h)}-${lab(a)}: ${c.actual} actual, ${c.expected.toFixed(1)} predicted`}>
                      <div className="text-[15px] font-semibold text-ink">{c.actual}</div>
                      <div className="text-[10px] text-ink-2">{d > 0 ? "+" : ""}{d.toFixed(1)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        Big number: how many matches ended with that score. Small number: actual minus what the model expected.
        Most common score: <strong className="text-ink">{top.homeGoals}-{top.awayGoals}</strong> ({top.actual} times,{" "}
        {top.expected.toFixed(1)} expected).
      </p>
    </div>
  );
}
