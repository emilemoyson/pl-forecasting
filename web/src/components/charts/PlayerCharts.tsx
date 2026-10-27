"use client";

import { useMemo, useState } from "react";
import type { Club, Player } from "@/lib/queries";
import { Crest } from "../Crest";
import { SortableTable, type Column } from "../SortableTable";
import { useTokens } from "./common";

type ClubIndex = Record<string, Club>;
const MIN_MINUTES = 900;
const signed = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

function PlayerCrests({ player, clubs, size = 16 }: { player: Player; clubs: ClubIndex; size?: number }) {
  return (
    <span className="inline-flex -space-x-1">
      {player.teams.split(", ").map((team) => (
        <Crest key={team} badgeCode={clubs[team].badgeCode} code={clubs[team].code} team={team} size={size} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Goals against xG: who finished above or below their chances

export function FinishingScatter({ players, clubs }: { players: Player[]; clubs: ClubIndex }) {
  const t = useTokens();
  const [hover, setHover] = useState<Player | null>(null);
  const pts = useMemo(() => players.filter((p) => p.minutes >= MIN_MINUTES && (p.goals > 0 || p.xg > 0.5)), [players]);

  const labelled = useMemo(() => {
    const byDiff = [...pts].sort((a, b) => (b.goals - b.xg) - (a.goals - a.xg));
    const scorers = [...pts].sort((a, b) => b.goals - a.goals).slice(0, 3);
    return new Set([...byDiff.slice(0, 5), ...byDiff.slice(-4), ...scorers].map((p) => p.playerId));
  }, [pts]);

  const W = 1000, H = 480, P = { top: 16, right: 24, bottom: 44, left: 44 };
  const max = Math.ceil(Math.max(...pts.flatMap((p) => [p.goals, p.xg])) / 5) * 5;
  const x = (v: number) => P.left + (v / max) * (W - P.left - P.right);
  const y = (v: number) => H - P.bottom - (v / max) * (H - P.top - P.bottom);
  const ticks = Array.from({ length: max / 5 + 1 }, (_, i) => i * 5);
  const colour = (p: Player) => {
    const d = p.goals - p.xg;
    return d >= 1.5 ? t["diverge-pos"] : d <= -1.5 ? t["diverge-neg"] : t["neutral-mark"];
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t["diverge-pos"] }} />Scored 1.5+ more than xG</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t["neutral-mark"] }} />Within 1.5</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t["diverge-neg"] }} />Scored 1.5+ fewer than xG</span>
        <span className="text-muted">Players with {MIN_MINUTES}+ minutes.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Goals scored against expected goals for each player"
           onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={x(tk)} x2={x(tk)} y1={P.top} y2={H - P.bottom} stroke={t.grid} />
            <line x1={P.left} x2={W - P.right} y1={y(tk)} y2={y(tk)} stroke={t.grid} />
            <text x={x(tk)} y={H - P.bottom + 16} fontSize={11} textAnchor="middle" fill={t["text-muted"]}>{tk}</text>
            <text x={P.left - 8} y={y(tk) + 4} fontSize={11} textAnchor="end" fill={t["text-muted"]}>{tk}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} stroke={t.axis} strokeWidth={1.5} />
        <text x={x(max) - 4} y={y(max) + 14} fontSize={11} textAnchor="end" fill={t["text-muted"]}>goals = xG</text>
        <text x={(P.left + W - P.right) / 2} y={H - 6} fontSize={12} textAnchor="middle" fill={t["text-secondary"]}>Expected goals (xG)</text>
        <text transform={`translate(12, ${(P.top + H - P.bottom) / 2}) rotate(-90)`} fontSize={12} textAnchor="middle"
              fill={t["text-secondary"]}>Goals</text>
        {pts.map((p) => (
          <g key={p.playerId} onMouseEnter={() => setHover(p)}>
            <circle cx={x(p.xg)} cy={y(p.goals)} r={10} fill="transparent" />
            <circle cx={x(p.xg)} cy={y(p.goals)} r={hover?.playerId === p.playerId ? 6 : 4} fill={colour(p)}
                    stroke={t.surface} strokeWidth={1.5} />
          </g>
        ))}
        {pts.filter((p) => labelled.has(p.playerId)).map((p) => {
          const right = x(p.xg) < W * 0.75;
          return (
            <text key={`l${p.playerId}`} x={x(p.xg) + (right ? 8 : -8)} y={y(p.goals) + 4} fontSize={11}
                  textAnchor={right ? "start" : "end"} fill={t["text-secondary"]} pointerEvents="none">
              {p.name.split(" ").slice(-1)[0]}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 flex min-h-[24px] items-center gap-2 text-[13px] text-ink-2" aria-live="polite">
        {hover ? (
          <>
            <PlayerCrests player={hover} clubs={clubs} />
            <strong className="text-ink">{hover.name}</strong> · {hover.goals} goals from {hover.xg.toFixed(1)} xG
            ({signed(hover.goals - hover.xg)}) · {hover.shots} shots · {hover.minutes.toLocaleString("en-US")} minutes
          </>
        ) : "Above the line means more goals than the chances were worth. Hover a dot."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard

type Row = Player & { per: number };

export function PlayersTable({ players, clubs }: { players: Player[]; clubs: ClubIndex }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("");
  const [per90, setPer90] = useState(false);
  const [minMinutes, setMinMinutes] = useState(450);

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players
      .filter((p) => p.minutes >= minMinutes)
      .filter((p) => !team || p.teams.split(", ").includes(team))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({ ...p, per: per90 ? 90 / p.minutes : 1 }));
  }, [players, query, team, per90, minMinutes]);

  const num = (v: number, d: number) => v.toFixed(d);
  const d = per90 ? 2 : 0;
  const columns: Column<Row>[] = [
    { key: "name", label: "Player", value: (p) => p.name,
      render: (p) => <span className="flex items-center gap-2"><PlayerCrests player={p} clubs={clubs} />{p.name}</span> },
    { key: "minutes", label: "Mins", value: (p) => p.minutes, render: (p) => p.minutes.toLocaleString("en-US"), align: "right" },
    { key: "goals", label: "Goals", value: (p) => p.goals * p.per, render: (p) => num(p.goals * p.per, d), align: "right" },
    { key: "xg", label: "xG", value: (p) => p.xg * p.per, render: (p) => num(p.xg * p.per, per90 ? 2 : 1), align: "right" },
    { key: "diff", label: "Goals − xG", value: (p) => p.goals - p.xg, render: (p) => signed(p.goals - p.xg), align: "right",
      title: "Season total, not per 90" },
    { key: "assists", label: "Assists", value: (p) => p.assists * p.per, render: (p) => num(p.assists * p.per, d), align: "right" },
    { key: "xa", label: "xA", value: (p) => p.xa * p.per, render: (p) => num(p.xa * p.per, per90 ? 2 : 1), align: "right",
      title: "Expected assists" },
    { key: "shots", label: "Shots", value: (p) => p.shots * p.per, render: (p) => num(p.shots * p.per, d), align: "right" },
    { key: "keyPasses", label: "Key passes", value: (p) => p.keyPasses * p.per, render: (p) => num(p.keyPasses * p.per, d), align: "right" },
    { key: "xgChain", label: "xG chain", value: (p) => p.xgChain * p.per, render: (p) => num(p.xgChain * p.per, per90 ? 2 : 1), align: "right",
      title: "xG of every possession the player was involved in" },
  ];

  const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink";
  const teams = Object.keys(clubs).sort();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <label className="sr-only" htmlFor="player-search">Search players</label>
        <input id="player-search" type="search" placeholder="Search players" value={query}
               onChange={(e) => setQuery(e.target.value)} className={`${input} w-44`} />
        <label className="sr-only" htmlFor="player-team">Club</label>
        <select id="player-team" value={team} onChange={(e) => setTeam(e.target.value)} className={input}>
          <option value="">All clubs</option>
          {teams.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="sr-only" htmlFor="player-minutes">Minimum minutes</label>
        <select id="player-minutes" value={minMinutes} onChange={(e) => setMinMinutes(Number(e.target.value))} className={input}>
          {[0, 450, 900, 1800].map((m) => <option key={m} value={m}>{m ? `${m}+ minutes` : "Any minutes"}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={per90} onChange={(e) => setPer90(e.target.checked)} />
          Per 90 minutes
        </label>
        <span className="ml-auto text-[12px] text-muted">{rows.length} players</span>
      </div>
      <SortableTable rows={rows} columns={columns} rowKey={(p) => p.playerId}
                     initialSort={{ key: "goals", dir: "desc" }} maxHeight={560} />
    </div>
  );
}
