"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { Club, HtFtFlow, MatchRow, WeeklyPosition } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { Crest, crestUrl } from "../Crest";
import { TipBox, useTokens } from "./common";

type ClubIndex = Record<string, Club>;

// ---------------------------------------------------------------------------
// Bump chart: league position at the end of every week

const ROW = 24;
const PAD = { top: 12, right: 88, bottom: 28, left: 28 };
const WIDTH = 900;

export function BumpChart({ positions, clubs, initial }: { positions: WeeklyPosition[]; clubs: ClubIndex; initial: string }) {
  const t = useTokens();
  const [selected, setSelected] = useState(initial);
  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { weeks, byTeam, finalOrder } = useMemo(() => {
    const weeks = [...new Set(positions.map((p) => p.week))].sort((a, b) => a - b);
    const byTeam = new Map<string, WeeklyPosition[]>();
    for (const p of positions) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
    const last = weeks[weeks.length - 1];
    const finalOrder = positions.filter((p) => p.week === last).sort((a, b) => a.position - b.position);
    return { weeks, byTeam, finalOrder };
  }, [positions]);

  const teams = finalOrder.length;
  const height = PAD.top + (teams - 1) * ROW + PAD.bottom;
  const plotW = WIDTH - PAD.left - PAD.right;
  const x = (week: number) => PAD.left + ((week - 1) / (weeks.length - 1)) * plotW;
  const y = (pos: number) => PAD.top + (pos - 1) * ROW;
  const active = hoverTeam ?? selected;

  // One axis label at the first week ending in each month
  const monthTicks = useMemo(() => {
    const seen = new Set<string>();
    const out: { week: number; label: string }[] = [];
    for (const w of weeks) {
      const end = positions.find((p) => p.week === w)!.weekEnd;
      const key = end.slice(0, 7);
      if (!seen.has(key)) {
        seen.add(key);
        const d = new Date(`${end}T00:00:00Z`);
        out.push({ week: w, label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) });
      }
    }
    return out;
  }, [weeks, positions]);

  const path = (rows: WeeklyPosition[]) =>
    rows.map((r, i) => `${i ? "L" : "M"}${x(r.week).toFixed(1)},${y(r.position).toFixed(1)}`).join("");

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const week = Math.round(((local.x - PAD.left) / plotW) * (weeks.length - 1)) + 1;
    setHoverWeek(Math.min(Math.max(week, 1), weeks.length));
  };

  const activeRows = byTeam.get(active) ?? [];
  const hoverRow = hoverWeek ? activeRows.find((r) => r.week === hoverWeek) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <label htmlFor="bump-team" className="text-ink-2">Highlight</label>
        <select id="bump-team" value={selected} onChange={(e) => setSelected(e.target.value)}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink">
          {finalOrder.map((p) => <option key={p.team} value={p.team}>{p.team}</option>)}
        </select>
        <span className="text-[12px] text-muted">or hover any line, or click a crest</span>
      </div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${height}`} className="min-w-[640px]" role="img"
             aria-label={`League position by week. ${active} highlighted.`}
             onMouseLeave={() => { setHoverTeam(null); setHoverWeek(null); }}>
          {Array.from({ length: teams }, (_, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(i + 1)} y2={y(i + 1)} stroke={t.grid} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(i + 1) + 4} textAnchor="end" fontSize={11} fill={t["text-muted"]}
                    className="tabular">{i + 1}</text>
            </g>
          ))}
          {monthTicks.map((m) => (
            <text key={m.week} x={x(m.week)} y={height - 8} fontSize={11} fill={t["text-muted"]} textAnchor="middle">
              {m.label}
            </text>
          ))}
          <rect x={PAD.left} y={0} width={plotW} height={height - PAD.bottom + 8} fill="transparent" onMouseMove={onMove} />
          {hoverWeek && <line x1={x(hoverWeek)} x2={x(hoverWeek)} y1={PAD.top - 6} y2={y(teams) + 6} stroke={t.axis} />}
          {[...byTeam.entries()].filter(([team]) => team !== active).map(([team, rows]) => (
            <g key={team} onMouseEnter={() => setHoverTeam(team)} onMouseMove={(e) => onMove(e as unknown as React.MouseEvent<SVGRectElement>)}>
              <path d={path(rows)} fill="none" stroke={t["neutral-mark"]} strokeWidth={1.5} strokeLinejoin="round" opacity={0.7} />
              <path d={path(rows)} fill="none" stroke="transparent" strokeWidth={12} />
            </g>
          ))}
          <path d={path(activeRows)} fill="none" stroke={t["series-1"]} strokeWidth={3} strokeLinejoin="round"
                pointerEvents="none" />
          {hoverRow && (
            <circle cx={x(hoverRow.week)} cy={y(hoverRow.position)} r={5} fill={t["series-1"]} stroke={t.surface} strokeWidth={2} />
          )}
          {finalOrder.map((p) => {
            const club = clubs[p.team];
            return (
              <g key={p.team} transform={`translate(${WIDTH - PAD.right + 8}, ${y(p.position) - 9})`}
                 onMouseEnter={() => setHoverTeam(p.team)} onClick={() => setSelected(p.team)} style={{ cursor: "pointer" }}>
                <rect x={-4} y={-2} width={PAD.right - 4} height={22} fill="transparent" />
                <image href={club ? crestUrl(club.badgeCode) : undefined}
                       width={18} height={18} />
                <text x={24} y={13} fontSize={11} fontWeight={p.team === active ? 600 : 400}
                      fill={p.team === active ? t["text-primary"] : t["text-secondary"]}>
                  {club?.code ?? p.team}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 min-h-[20px] text-[13px] text-ink-2" aria-live="polite">
        {hoverRow ? (
          <>
            <strong className="text-ink">{active}</strong>: {ordinal(hoverRow.position)} with {hoverRow.points} points
            after the week ending {formatDate(hoverRow.weekEnd)}
          </>
        ) : (
          <>
            <strong className="text-ink">{active}</strong>: finished {ordinal(activeRows.at(-1)?.position ?? 0)}, best{" "}
            {ordinal(Math.min(...activeRows.map((r) => r.position)))}, worst {ordinal(Math.max(...activeRows.map((r) => r.position)))}
          </>
        )}
      </p>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------
// Results grid: every home vs away score

export function ResultsGrid({ matches, order, clubs }: { matches: MatchRow[]; order: string[]; clubs: ClubIndex }) {
  const [hover, setHover] = useState<{ home: string; away: string } | null>(null);
  const lookup = useMemo(() => new Map(matches.map((m) => [`${m.home}|${m.away}`, m])), [matches]);
  const bg = { H: "color-mix(in srgb, var(--diverge-pos) 38%, transparent)",
               D: "color-mix(in srgb, var(--neutral-mark) 45%, transparent)",
               A: "color-mix(in srgb, var(--diverge-neg) 38%, transparent)" };
  const hovered = hover ? lookup.get(`${hover.home}|${hover.away}`) : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12px] text-ink-2">
        {(["H", "D", "A"] as const).map((r) => (
          <span key={r} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: bg[r] }} />
            {r === "H" ? "Home win" : r === "D" ? "Draw" : "Away win"}
          </span>
        ))}
        <span className="text-muted">Rows are the home side, columns the away side, both in final league order.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate text-[11px]" style={{ borderSpacing: 2 }} onMouseLeave={() => setHover(null)}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface" />
              {order.map((away) => (
                <th key={away} scope="col" title={away} className="p-0 align-bottom"
                    style={{ opacity: hover && hover.away !== away ? 0.45 : 1 }}>
                  <div className="flex justify-center pb-1">
                    <Crest badgeCode={clubs[away].badgeCode} code={clubs[away].code} team={away} size={20} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((home) => (
              <tr key={home}>
                <th scope="row" className="sticky left-0 z-10 bg-surface pr-2 text-left font-normal whitespace-nowrap"
                    style={{ opacity: hover && hover.home !== home ? 0.45 : 1 }}>
                  <span className="flex items-center gap-1.5">
                    <Crest badgeCode={clubs[home].badgeCode} code={clubs[home].code} team={home} size={18} />
                    <span className="w-8 text-ink-2">{clubs[home].code}</span>
                  </span>
                </th>
                {order.map((away) => {
                  if (home === away) return <td key={away} className="h-7 w-9 rounded-sm" style={{ background: "var(--grid)" }} />;
                  const m = lookup.get(`${home}|${away}`);
                  const dim = hover && hover.home !== home && hover.away !== away;
                  return (
                    <td key={away} className="tabular h-7 w-9 rounded-sm text-center text-ink"
                        style={{ background: m ? bg[m.result] : undefined, opacity: dim ? 0.35 : 1 }}
                        onMouseEnter={() => setHover({ home, away })}
                        title={m ? `${home} ${m.homeGoals}-${m.awayGoals} ${away}, ${formatDate(m.date)}` : undefined}>
                      {m ? `${m.homeGoals}-${m.awayGoals}` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 min-h-[20px] text-[13px] text-ink-2" aria-live="polite">
        {hovered ? (
          <>
            <strong className="text-ink">{hovered.home} {hovered.homeGoals}-{hovered.awayGoals} {hovered.away}</strong>
            {" "}· {formatDate(hovered.date)} · xG {hovered.homeXg.toFixed(1)}-{hovered.awayXg.toFixed(1)}
          </>
        ) : (
          "Hover a cell for the date and xG."
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Half-time to full-time flow

const HT_LABELS = { W: "Home leading", D: "Level", L: "Away leading" } as const;
const FT_LABELS = { W: "Home win", D: "Draw", L: "Away win" } as const;
const STATES = ["W", "D", "L"] as const;

export function HtFtSankey({ flows }: { flows: HtFtFlow[] }) {
  const t = useTokens();
  const colour = { W: t["diverge-pos"], D: t["neutral-mark"], L: t["diverge-neg"] };
  const nodes = [
    ...STATES.map((s) => ({ name: `HT: ${HT_LABELS[s]}`, state: s, side: "ht" })),
    ...STATES.map((s) => ({ name: `FT: ${FT_LABELS[s]}`, state: s, side: "ft" })),
  ];
  const links = flows
    .filter((f) => f.matches > 0)
    .map((f) => ({ source: STATES.indexOf(f.ht), target: 3 + STATES.indexOf(f.ft), value: f.matches }));
  const total = flows.reduce((s, f) => s + f.matches, 0);

  type NodeProps = { x: number; y: number; width: number; height: number; payload: (typeof nodes)[number] & { value: number } };
  const Node = ({ x, y, width, height, payload }: NodeProps) => {
    const left = payload.side === "ht";
    return (
      <Layer>
        <Rectangle x={x} y={y} width={width} height={height} fill={colour[payload.state]} radius={2} />
        <text x={left ? x - 8 : x + width + 8} y={y + height / 2 - 2} textAnchor={left ? "end" : "start"}
              fontSize={12} fill={t["text-primary"]}>{payload.name.slice(4)}</text>
        <text x={left ? x - 8 : x + width + 8} y={y + height / 2 + 13} textAnchor={left ? "end" : "start"}
              fontSize={11} fill={t["text-muted"]}>{payload.value} matches</text>
      </Layer>
    );
  };

  type LinkProps = {
    sourceX: number; targetX: number; sourceY: number; targetY: number;
    sourceControlX: number; targetControlX: number; linkWidth: number;
    payload: { source: { state: "W" | "D" | "L" }; target: { state: "W" | "D" | "L" } };
  };
  const Link_ = ({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }: LinkProps) => {
    const changed = payload.source.state !== payload.target.state;
    return (
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none" stroke={colour[payload.target.state]} strokeWidth={Math.max(1, linkWidth)}
        strokeOpacity={changed ? 0.55 : 0.22}
      />
    );
  };

  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey data={{ nodes, links }} nodePadding={28} nodeWidth={10} iterations={0} sort={false}
                margin={{ top: 8, right: 110, bottom: 8, left: 110 }}
                node={Node as never} link={Link_ as never}>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { payload?: { source?: { name: string }; target?: { name: string }; value: number; name?: string } };
              const d = p.payload;
              if (!d) return null;
              if (d.source && d.target) {
                return <TipBox title={`${d.source.name.slice(4)} → ${d.target.name.slice(4)}`}
                               rows={[{ label: "Matches", value: String(d.value) },
                                      { label: "Share of season", value: `${((d.value / total) * 100).toFixed(1)}%` }]} />;
              }
              return <TipBox title={d.name ?? ""} rows={[{ label: "Matches", value: String(d.value) }]} />;
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

export function TeamLink({ team, club, size = 18 }: { team: string; club?: Club; size?: number }) {
  return (
    <Link href={`/teams/${encodeURIComponent(team)}`} className="inline-flex items-center gap-2 hover:underline">
      {club && <Crest badgeCode={club.badgeCode} code={club.code} team={team} size={size} />}
      <span>{team}</span>
    </Link>
  );
}
