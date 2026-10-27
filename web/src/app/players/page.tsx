import type { Metadata } from "next";
import { Card, Kpi } from "@/components/Card";
import { FinishingScatter, PlayersTable } from "@/components/charts/PlayerCharts";
import { getClubIndex, getPlayers } from "@/lib/queries";

export const metadata: Metadata = { title: "Players · Premier League 2025-26" };
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function PlayersPage() {
  const [players, clubs] = await Promise.all([getPlayers(), getClubIndex()]);
  const by = (f: (p: (typeof players)[number]) => number) => [...players].sort((a, b) => f(b) - f(a))[0];
  const scorer = by((p) => p.goals);
  const assister = by((p) => p.assists);
  const finisher = by((p) => p.goals - p.xg);
  const creator = by((p) => p.xa);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Top scorer" value={String(scorer.goals)} detail={`${scorer.name} · ${scorer.xg.toFixed(1)} xG`} />
        <Kpi label="Most assists" value={String(assister.assists)} detail={`${assister.name} · ${assister.xa.toFixed(1)} xA`} />
        <Kpi label="Best finisher" value={`+${(finisher.goals - finisher.xg).toFixed(1)}`}
             detail={`${finisher.name}: ${finisher.goals} goals from ${finisher.xg.toFixed(1)} xG`} />
        <Kpi label="Chance creator" value={creator.xa.toFixed(1)} detail={`${creator.name} · expected assists`} />
      </div>

      <Card title="Finishing: goals against expected goals"
            subtitle="Each dot is a player. The diagonal is where goals equal the quality of chances taken.">
        <FinishingScatter players={players} clubs={clubs} />
      </Card>

      <Card title="Player leaderboard"
            subtitle="Understat season totals. Players who moved clubs mid-season show both crests. Click a heading to sort.">
        <PlayersTable players={players} clubs={clubs} />
      </Card>
    </div>
  );
}
