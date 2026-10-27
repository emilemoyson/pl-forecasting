"use client";

import { useMemo, useState } from "react";
import type { MatchRow, ModelScore, Standing } from "@/lib/queries";
import { formatDate, MODEL_LABELS, pct } from "@/lib/format";
import { SortableTable, type Column } from "./SortableTable";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const STANDING_COLUMNS: Column<Standing>[] = [
  { key: "rank", label: "#", value: (s) => s.rank, align: "right" },
  { key: "team", label: "Team", value: (s) => s.team },
  { key: "played", label: "P", value: (s) => s.played, align: "right", title: "Played" },
  { key: "won", label: "W", value: (s) => s.won, align: "right", title: "Won" },
  { key: "drawn", label: "D", value: (s) => s.drawn, align: "right", title: "Drawn" },
  { key: "lost", label: "L", value: (s) => s.lost, align: "right", title: "Lost" },
  { key: "gf", label: "GF", value: (s) => s.gf, align: "right", title: "Goals for" },
  { key: "ga", label: "GA", value: (s) => s.ga, align: "right", title: "Goals against" },
  { key: "gd", label: "GD", value: (s) => s.gd, render: (s) => signed(s.gd), align: "right", title: "Goal difference" },
  { key: "xgf", label: "xGF", value: (s) => s.xgf, render: (s) => s.xgf.toFixed(1), align: "right", title: "Expected goals for" },
  { key: "xga", label: "xGA", value: (s) => s.xga, render: (s) => s.xga.toFixed(1), align: "right", title: "Expected goals against" },
  { key: "points", label: "Pts", value: (s) => s.points, render: (s) => <strong>{s.points}</strong>, align: "right" },
];

export function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <SortableTable rows={standings} columns={STANDING_COLUMNS} rowKey={(s) => s.team}
                   initialSort={{ key: "rank", dir: "asc" }} />
  );
}

const SCORE_COLUMNS: Column<ModelScore>[] = [
  { key: "model", label: "Model", value: (s) => MODEL_LABELS[s.model] ?? s.model },
  { key: "logLoss", label: "Log loss", value: (s) => s.logLoss, render: (s) => s.logLoss.toFixed(4), align: "right" },
  { key: "brier", label: "Brier", value: (s) => s.brier, render: (s) => s.brier.toFixed(4), align: "right" },
  { key: "accuracy", label: "Accuracy", value: (s) => s.accuracy, render: (s) => pct(s.accuracy), align: "right" },
  { key: "n", label: "Matches", value: (s) => s.n, align: "right" },
];

export function ScoresTable({ scores }: { scores: ModelScore[] }) {
  return (
    <SortableTable rows={scores} columns={SCORE_COLUMNS} rowKey={(s) => s.model}
                   initialSort={{ key: "logLoss", dir: "asc" }} />
  );
}

/** Probability the given model put on the result that actually happened. */
const pResult = (m: MatchRow, who: "market" | "model") =>
  m.result === "H" ? m[`${who}Home`] : m.result === "D" ? m[`${who}Draw`] : m[`${who}Away`];

const RESULT_LABEL = { H: "Home win", D: "Draw", A: "Away win" } as const;

const MATCH_COLUMNS: Column<MatchRow>[] = [
  { key: "date", label: "Date", value: (m) => m.date, render: (m) => formatDate(m.date) },
  { key: "home", label: "Home", value: (m) => m.home },
  { key: "score", label: "Score", value: (m) => m.homeGoals - m.awayGoals,
    render: (m) => `${m.homeGoals} - ${m.awayGoals}`, align: "right", title: "Sorts by home goal margin" },
  { key: "away", label: "Away", value: (m) => m.away },
  { key: "result", label: "Result", value: (m) => m.result, render: (m) => RESULT_LABEL[m.result] },
  { key: "homeXg", label: "xG home", value: (m) => m.homeXg, render: (m) => m.homeXg.toFixed(2), align: "right" },
  { key: "awayXg", label: "xG away", value: (m) => m.awayXg, render: (m) => m.awayXg.toFixed(2), align: "right" },
  { key: "marketP", label: "Market p(result)", value: (m) => pResult(m, "market"),
    render: (m) => pct(pResult(m, "market"), 0), align: "right",
    title: "Closing-odds probability, margin removed, of the result that happened" },
  { key: "modelP", label: "Model p(result)", value: (m) => pResult(m, "model"),
    render: (m) => pct(pResult(m, "model"), 0), align: "right",
    title: "Poisson on xG probability of the result that happened" },
];

export function MatchesTable({ matches }: { matches: MatchRow[] }) {
  const teams = useMemo(() => [...new Set(matches.map((m) => m.home))].sort(), [matches]);
  const [team, setTeam] = useState("");
  const [result, setResult] = useState("");

  const rows = useMemo(
    () =>
      matches.filter(
        (m) => (!team || m.home === team || m.away === team) && (!result || m.result === result),
      ),
    [matches, team, result],
  );

  const selectClass = "rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="team-filter">Team</label>
        <select id="team-filter" value={team} onChange={(e) => setTeam(e.target.value)} className={selectClass}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="sr-only" htmlFor="result-filter">Result</label>
        <select id="result-filter" value={result} onChange={(e) => setResult(e.target.value)} className={selectClass}>
          <option value="">All results</option>
          <option value="H">Home wins</option>
          <option value="D">Draws</option>
          <option value="A">Away wins</option>
        </select>
        <span className="ml-auto text-[12px] text-muted">{rows.length} of {matches.length} matches</span>
      </div>
      <SortableTable rows={rows} columns={MATCH_COLUMNS} rowKey={(m) => m.matchId}
                     initialSort={{ key: "date", dir: "asc" }} maxHeight={560} />
    </div>
  );
}
