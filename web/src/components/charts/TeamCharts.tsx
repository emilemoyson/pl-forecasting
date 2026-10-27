"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Club, FormPoint, TeamGame, TeamProfile } from "@/lib/queries";
import { shortName, formatDate } from "@/lib/format";
import { Crest, crestUrl } from "../Crest";
import { useTokens } from "./common";

type ClubIndex = Record<string, Club>;
const fmtSigned = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

// ---------------------------------------------------------------------------
// Style map: clubs placed by two season averages, crests as points

type Axis = { key: keyof TeamProfile; label: string; better: "high" | "low"; fmt: (v: number) => string };
const VIEWS: Record<string, { title: string; x: Axis; y: Axis; quadrants: [string, string, string, string] }> = {
  quality: {
    title: "Attack vs defence",
    x: { key: "xgfPerGame", label: "xG created per game", better: "high", fmt: (v) => v.toFixed(2) },
    y: { key: "xgaPerGame", label: "xG conceded per game (fewer is higher)", better: "low", fmt: (v) => v.toFixed(2) },
    // top-right, top-left, bottom-left, bottom-right
    quadrants: ["Strong both ends", "Solid, short of goals", "Struggling both ends", "Exciting, leaky"],
  },
  style: {
    title: "Pressing vs penetration",
    x: { key: "ppda", label: "Pressing: opponent passes per defensive action (fewer is further right)", better: "low", fmt: (v) => v.toFixed(1) },
    y: { key: "deepPerGame", label: "Deep completions per game", better: "high", fmt: (v) => v.toFixed(1) },
    quadrants: ["Press high, get in behind", "Sit off, still penetrate", "Sit off, rarely penetrate", "Press hard, little end product"],
  },
};

const SW = 760;
const SH = 520;
const SP = { top: 20, right: 24, bottom: 48, left: 56 };

export function StyleScatter({ profiles, clubs }: { profiles: TeamProfile[]; clubs: ClubIndex }) {
  const t = useTokens();
  const [view, setView] = useState<keyof typeof VIEWS>("quality");
  const [hover, setHover] = useState<string | null>(null);
  const v = VIEWS[view];

  const scale = (axis: Axis, range: [number, number]) => {
    const vals = profiles.map((p) => p[axis.key] as number);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08;
    const [a, b] = axis.better === "high" ? [lo - pad, hi + pad] : [hi + pad, lo - pad];
    const f = (val: number) => range[0] + ((val - a) / (b - a)) * (range[1] - range[0]);
    const ticks = Array.from({ length: 5 }, (_, i) => a + ((b - a) * i) / 4);
    const median = [...vals].sort((m, n) => m - n)[Math.floor(vals.length / 2)];
    return { f, ticks, median };
  };
  const xs = scale(v.x, [SP.left, SW - SP.right]);
  const ys = scale(v.y, [SH - SP.bottom, SP.top]);
  const hovered = profiles.find((p) => p.team === hover);
  const qx = [SW - SP.right - 6, SP.left + 6, SP.left + 6, SW - SP.right - 6];
  const qy = [SP.top + 14, SP.top + 14, SH - SP.bottom - 8, SH - SP.bottom - 8];

  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border border-line p-0.5 text-[13px]" role="tablist">
        {Object.entries(VIEWS).map(([key, val]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}
                  className={`rounded px-3 py-1 ${view === key ? "bg-hover font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
            {val.title}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${SW} ${SH}`} className="w-full" role="img" aria-label={`${v.title}: ${v.x.label} against ${v.y.label}`}>
        {xs.ticks.map((tk) => (
          <g key={`x${tk}`}>
            <line x1={xs.f(tk)} x2={xs.f(tk)} y1={SP.top} y2={SH - SP.bottom} stroke={t.grid} />
            <text x={xs.f(tk)} y={SH - SP.bottom + 18} fontSize={11} textAnchor="middle" fill={t["text-muted"]}>{v.x.fmt(tk)}</text>
          </g>
        ))}
        {ys.ticks.map((tk) => (
          <g key={`y${tk}`}>
            <line x1={SP.left} x2={SW - SP.right} y1={ys.f(tk)} y2={ys.f(tk)} stroke={t.grid} />
            <text x={SP.left - 8} y={ys.f(tk) + 4} fontSize={11} textAnchor="end" fill={t["text-muted"]}>{v.y.fmt(tk)}</text>
          </g>
        ))}
        <line x1={xs.f(xs.median)} x2={xs.f(xs.median)} y1={SP.top} y2={SH - SP.bottom} stroke={t.axis} strokeWidth={1.5} />
        <line x1={SP.left} x2={SW - SP.right} y1={ys.f(ys.median)} y2={ys.f(ys.median)} stroke={t.axis} strokeWidth={1.5} />
        {v.quadrants.map((q, i) => (
          <text key={q} x={qx[i]} y={qy[i]} fontSize={11} fontWeight={600} textAnchor={i === 0 || i === 3 ? "end" : "start"}
                fill={t["text-muted"]}>{q}</text>
        ))}
        <text x={(SP.left + SW - SP.right) / 2} y={SH - 8} fontSize={12} textAnchor="middle" fill={t["text-secondary"]}>{v.x.label} →</text>
        <text transform={`translate(14, ${(SP.top + SH - SP.bottom) / 2}) rotate(-90)`} fontSize={12} textAnchor="middle"
              fill={t["text-secondary"]}>{v.y.label} →</text>
        {profiles.map((p) => {
          const cx = xs.f(p[v.x.key] as number);
          const cy = ys.f(p[v.y.key] as number);
          const size = p.team === hover ? 40 : 30;
          return (
            <Link key={p.team} href={`/teams/${encodeURIComponent(p.team)}`}>
              <g onMouseEnter={() => setHover(p.team)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle cx={cx} cy={cy} r={18} fill="transparent" />
                <image href={crestUrl(clubs[p.team].badgeCode)} x={cx - size / 2} y={cy - size / 2} width={size} height={size}>
                  <title>{p.team}</title>
                </image>
              </g>
            </Link>
          );
        })}
      </svg>
      <p className="mt-1 min-h-[20px] text-[13px] text-ink-2" aria-live="polite">
        {hovered ? (
          <><strong className="text-ink">{hovered.team}</strong>: {v.x.label.split(":")[0].split(" (")[0]} {v.x.fmt(hovered[v.x.key] as number)},{" "}
            {v.y.label.split(" (")[0].toLowerCase()} {v.y.fmt(hovered[v.y.key] as number)}</>
        ) : "Lines mark the league median. Click a crest for the club page."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Luck: actual points against Understat expected points

export function LuckChart({ profiles, clubs }: { profiles: TeamProfile[]; clubs: ClubIndex }) {
  const t = useTokens();
  const rows = [...profiles].sort((a, b) => (b.points - b.xpts) - (a.points - a.xpts));
  const all = profiles.flatMap((p) => [p.points, p.xpts]);
  const lo = Math.floor(Math.min(...all) / 10) * 10;
  const hi = Math.ceil(Math.max(...all) / 10) * 10;
  const W = 600, LEFT = 140, RIGHT = 48, ROWH = 26, TOP = 24;
  const H = TOP + rows.length * ROWH + 24;
  const x = (v: number) => LEFT + ((v - lo) / (hi - lo)) * (W - LEFT - RIGHT);
  const ticks = Array.from({ length: (hi - lo) / 10 + 1 }, (_, i) => lo + i * 10);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="none" stroke={t["text-secondary"]} strokeWidth="1.5" /></svg>
          Expected points (from the chances each side created and allowed)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={t["text-primary"]} /></svg>Actual points
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Actual points against expected points for each team">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={x(tk)} x2={x(tk)} y1={TOP - 8} y2={H - 20} stroke={t.grid} />
            <text x={x(tk)} y={H - 6} fontSize={11} textAnchor="middle" fill={t["text-muted"]}>{tk}</text>
          </g>
        ))}
        {rows.map((p, i) => {
          const cy = TOP + i * ROWH + ROWH / 2 - 4;
          const diff = p.points - p.xpts;
          const col = diff >= 0 ? t["diverge-pos"] : t["diverge-neg"];
          return (
            <g key={p.team}>
              <title>{`${p.team}: ${p.points} points, ${p.xpts.toFixed(1)} expected (${fmtSigned(diff)})`}</title>
              <image href={crestUrl(clubs[p.team].badgeCode)} x={4} y={cy - 9} width={18} height={18} />
              <text x={28} y={cy + 4} fontSize={12} fill={t["text-secondary"]}>{shortName(p.team)}</text>
              <line x1={x(p.xpts)} x2={x(p.points)} y1={cy} y2={cy} stroke={col} strokeWidth={3} strokeLinecap="round" />
              <circle cx={x(p.xpts)} cy={cy} r={4.5} fill={t.surface} stroke={t["text-secondary"]} strokeWidth={1.5} />
              <circle cx={x(p.points)} cy={cy} r={5} fill={t["text-primary"]} />
              <text x={W - RIGHT + 8} y={cy + 4} fontSize={12} fill={t["text-secondary"]} className="tabular">{fmtSigned(diff)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form waves: rolling 6-game xG difference, one small chart per club

export function FormWaves({ form, order, clubs }: { form: FormPoint[]; order: string[]; clubs: ClubIndex }) {
  const t = useTokens();
  const byTeam = useMemo(() => {
    const m = new Map<string, FormPoint[]>();
    for (const f of form) m.set(f.team, [...(m.get(f.team) ?? []), f]);
    return m;
  }, [form]);
  const extent = Math.max(...form.map((f) => Math.abs(f.rolling)));
  const W = 200, H = 64;
  const games = Math.max(...form.map((f) => f.game));
  const x = (g: number) => ((g - 1) / (games - 1)) * W;
  const y = (v: number) => H / 2 - (v / extent) * (H / 2 - 2);

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
      {order.map((team) => {
        const rows = byTeam.get(team) ?? [];
        const line = rows.map((r, i) => `${i ? "L" : "M"}${x(r.game).toFixed(1)},${y(r.rolling).toFixed(1)}`).join("");
        const area = `${line}L${x(games)},${H / 2}L0,${H / 2}Z`;
        const id = `clip-${clubs[team].code}`;
        const last = rows.at(-1)?.rolling ?? 0;
        return (
          <Link key={team} href={`/teams/${encodeURIComponent(team)}`} className="group block">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] text-ink-2 group-hover:text-ink">
              <Crest badgeCode={clubs[team].badgeCode} code={clubs[team].code} team={team} size={16} />
              <span className="truncate">{team}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
                 aria-label={`${team} rolling xG difference, ending at ${fmtSigned(last, 2)}`}>
              <defs>
                <clipPath id={`${id}-pos`}><rect x={0} y={0} width={W} height={H / 2} /></clipPath>
                <clipPath id={`${id}-neg`}><rect x={0} y={H / 2} width={W} height={H / 2} /></clipPath>
              </defs>
              <path d={area} fill={t["diverge-pos"]} opacity={0.75} clipPath={`url(#${id}-pos)`} />
              <path d={area} fill={t["diverge-neg"]} opacity={0.75} clipPath={`url(#${id}-neg)`} />
              <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={t.axis} />
            </svg>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Club page: every game as a strip, and xG for and against per game

export function ResultStrip({ games, clubs }: { games: TeamGame[]; clubs: ClubIndex }) {
  const colour = { 3: "var(--diverge-pos)", 1: "var(--neutral-mark)", 0: "var(--diverge-neg)" } as const;
  const [hover, setHover] = useState<TeamGame | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-[3px]" onMouseLeave={() => setHover(null)}>
        {games.map((g) => (
          <span key={g.matchId} onMouseEnter={() => setHover(g)}
                title={`${formatDate(g.date)}: ${g.isHome ? "vs" : "at"} ${g.opponent} ${g.gf}-${g.ga}`}
                className="flex h-7 w-6 items-center justify-center rounded text-[11px] font-semibold"
                style={{ background: colour[g.pts as 0 | 1 | 3], color: g.pts === 1 ? "var(--text-primary)" : "#ffffff" }}>
            {g.pts === 3 ? "W" : g.pts === 1 ? "D" : "L"}
          </span>
        ))}
      </div>
      <p className="mt-2 flex min-h-[24px] items-center gap-2 text-[13px] text-ink-2" aria-live="polite">
        {hover ? (
          <>
            {formatDate(hover.date)} · {hover.isHome ? "vs" : "at"}
            <Crest badgeCode={clubs[hover.opponent].badgeCode} code={clubs[hover.opponent].code} team={hover.opponent} size={18} />
            <strong className="text-ink">{hover.opponent} {hover.gf}-{hover.ga}</strong>
            · xG {hover.xgf.toFixed(1)}-{hover.xga.toFixed(1)} · market gave this result {(hover.marketP * 100).toFixed(0)}%
          </>
        ) : "Every league game in order. Hover for details."}
      </p>
    </div>
  );
}

export function XgTimeline({ games }: { games: TeamGame[] }) {
  const t = useTokens();
  const W = 760, H = 220, PADL = 36, MID = H / 2;
  const max = Math.max(...games.flatMap((g) => [g.xgf, g.xga]), 1);
  const bw = (W - PADL) / games.length;
  const s = (v: number) => (v / max) * (MID - 14);
  const ticks = [Math.floor(max), Math.floor(max / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: t["diverge-pos"] }} />xG created (up)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: t["diverge-neg"] }} />xG conceded (down)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-3" style={{ background: t["text-primary"] }} />Goals</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="xG created and conceded in each game">
        {ticks.flatMap((v) => [v, -v]).map((v) => (
          <g key={v}>
            <line x1={PADL} x2={W} y1={MID - s(v)} y2={MID - s(v)} stroke={t.grid} />
            <text x={PADL - 6} y={MID - s(v) + 4} fontSize={10} textAnchor="end" fill={t["text-muted"]}>{Math.abs(v)}</text>
          </g>
        ))}
        {games.map((g, i) => {
          const x0 = PADL + i * bw + 1;
          return (
            <g key={g.matchId}>
              <title>{`${formatDate(g.date)} ${g.isHome ? "vs" : "at"} ${g.opponent}: ${g.gf}-${g.ga}, xG ${g.xgf.toFixed(2)}-${g.xga.toFixed(2)}`}</title>
              <rect x={x0} y={MID - s(g.xgf)} width={bw - 2} height={s(g.xgf)} fill={t["diverge-pos"]} rx={2} />
              <rect x={x0} y={MID} width={bw - 2} height={s(g.xga)} fill={t["diverge-neg"]} rx={2} />
              <line x1={x0} x2={x0 + bw - 2} y1={MID - s(Math.min(g.gf, max))} y2={MID - s(Math.min(g.gf, max))}
                    stroke={t["text-primary"]} strokeWidth={2} />
              <line x1={x0} x2={x0 + bw - 2} y1={MID + s(Math.min(g.ga, max))} y2={MID + s(Math.min(g.ga, max))}
                    stroke={t["text-primary"]} strokeWidth={2} />
            </g>
          );
        })}
        <line x1={PADL} x2={W} y1={MID} y2={MID} stroke={t.axis} />
      </svg>
    </div>
  );
}
