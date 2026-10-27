"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Club, MatchRow, ModelScore, Standing, TeamGame, TeamProfile } from "@/lib/queries";
import { Crest } from "./Crest";
import { formatDate, MODEL_LABELS, pct } from "@/lib/format";
import { SortableTable, type Column } from "./SortableTable";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const STANDING_COLUMNS: Column<Standing>[] = [
  { key: "rank", label: "#", value: (s) => s.rank, align: "right" },
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

type ClubIndex = Record<string, Club>;

/** Team name with crest, linking to the club page. */
export function TeamCell({ team, clubs }: { team: string; clubs: ClubIndex }) {
  const c = clubs[team];
  return (
    <Link href={`/teams/${encodeURIComponent(team)}`} className="inline-flex items-center gap-2 hover:underline">
      {c && <Crest badgeCode={c.badgeCode} code={c.code} team={team} size={18} />}
      {team}
    </Link>
  );
}

const teamColumn = <T extends { team: string }>(clubs: ClubIndex): Column<T> => ({
  key: "team", label: "Team", value: (r) => r.team, render: (r) => <TeamCell team={r.team} clubs={clubs} />,
});

export function StandingsTable({ standings, clubs }: { standings: Standing[]; clubs: ClubIndex }) {
  const columns = [STANDING_COLUMNS[0], teamColumn<Standing>(clubs), ...STANDING_COLUMNS.slice(1)];
  return (
    <SortableTable rows={standings} columns={columns} rowKey={(s) => s.team}
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

export function DisciplineTable({ profiles, clubs }: { profiles: TeamProfile[]; clubs: ClubIndex }) {
  const f1 = (v: number) => v.toFixed(1);
  const columns: Column<TeamProfile>[] = [
    teamColumn<TeamProfile>(clubs),
    { key: "shots", label: "Shots", value: (p) => p.shotsPerGame, render: (p) => f1(p.shotsPerGame), align: "right", title: "Per game" },
    { key: "sot", label: "On target", value: (p) => p.sotPerGame, render: (p) => f1(p.sotPerGame), align: "right", title: "Per game" },
    { key: "corners", label: "Corners", value: (p) => p.cornersPerGame, render: (p) => f1(p.cornersPerGame), align: "right", title: "Per game" },
    { key: "fouls", label: "Fouls", value: (p) => p.foulsPerGame, render: (p) => f1(p.foulsPerGame), align: "right", title: "Per game" },
    { key: "yellows", label: "Yellows", value: (p) => p.yellows, align: "right", title: "Season total" },
    { key: "reds", label: "Reds", value: (p) => p.reds, align: "right", title: "Season total" },
    { key: "ppda", label: "PPDA", value: (p) => p.ppda, render: (p) => f1(p.ppda), align: "right",
      title: "Opponent passes per defensive action. Lower means a harder press" },
  ];
  return <SortableTable rows={profiles} columns={columns} rowKey={(p) => p.team} initialSort={{ key: "shots", dir: "desc" }} />;
}

export function ComebackTable({ profiles, clubs }: { profiles: TeamProfile[]; clubs: ClubIndex }) {
  const columns: Column<TeamProfile>[] = [
    teamColumn<TeamProfile>(clubs),
    { key: "comebackPoints", label: "From behind", value: (p) => p.comebackPoints, align: "right",
      title: "Points won in games they trailed at half-time" },
    { key: "blownPoints", label: "Dropped", value: (p) => p.blownPoints, align: "right",
      title: "Points dropped in games they led at half-time" },
    { key: "net", label: "Net", value: (p) => p.comebackPoints - p.blownPoints,
      render: (p) => signed(p.comebackPoints - p.blownPoints), align: "right" },
  ];
  return <SortableTable rows={profiles} columns={columns} rowKey={(p) => p.team}
                        initialSort={{ key: "net", dir: "desc" }} maxHeight={340} />;
}

export function TeamGamesTable({ games, clubs }: { games: TeamGame[]; clubs: ClubIndex }) {
  const columns: Column<TeamGame>[] = [
    { key: "date", label: "Date", value: (g) => g.date, render: (g) => formatDate(g.date) },
    { key: "venue", label: "Venue", value: (g) => (g.isHome ? "Home" : "Away"), render: (g) => (g.isHome ? "Home" : "Away") },
    { key: "opponent", label: "Opponent", value: (g) => g.opponent, render: (g) => <TeamCell team={g.opponent} clubs={clubs} /> },
    { key: "score", label: "Score", value: (g) => g.gf - g.ga, render: (g) => `${g.gf}-${g.ga}`, align: "right" },
    { key: "xg", label: "xG", value: (g) => g.xgf - g.xga, render: (g) => `${g.xgf.toFixed(1)}-${g.xga.toFixed(1)}`, align: "right" },
    { key: "pts", label: "Pts", value: (g) => g.pts, align: "right" },
    { key: "marketP", label: "Market p(result)", value: (g) => g.marketP, render: (g) => pct(g.marketP, 0), align: "right",
      title: "Closing-odds probability of the result that happened" },
  ];
  return <SortableTable rows={games} columns={columns} rowKey={(g) => g.matchId} initialSort={{ key: "date", dir: "asc" }} maxHeight={480} />;
}
