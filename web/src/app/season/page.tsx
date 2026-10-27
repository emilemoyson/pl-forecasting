import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { BumpChart, HtFtSankey, ResultsGrid } from "@/components/charts/SeasonCharts";
import { ComebackTable, StandingsTable } from "@/components/Tables";
import { getClubIndex, getHtFt, getMatches, getStandings, getTeamProfiles, getWeeklyPositions } from "@/lib/queries";

export const metadata: Metadata = { title: "Season · Premier League 2025-26" };
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function SeasonPage() {
  const [positions, standings, matches, flows, profiles, clubs] = await Promise.all([
    getWeeklyPositions(), getStandings(), getMatches(), getHtFt(), getTeamProfiles(), getClubIndex(),
  ]);
  const order = standings.map((s) => s.team);
  const total = flows.reduce((s, f) => s + f.matches, 0);
  const flipped = flows.filter((f) => f.ht !== "D" && f.ft !== "D" && f.ht !== f.ft).reduce((s, f) => s + f.matches, 0);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title="The season week by week"
            subtitle="League position at the end of every week. Flat stretches are international breaks.">
        <BumpChart positions={positions} clubs={clubs} initial={order[0]} />
      </Card>

      <Card title="Every result" subtitle="All 380 scores in one grid.">
        <ResultsGrid matches={matches} order={order} clubs={clubs} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Half-time to full-time"
              subtitle={`How the score at the break turned into the result. ${flipped} of ${total} matches were turned around completely.`}>
          <HtFtSankey flows={flows} />
        </Card>
        <Card className="lg:col-span-2" title="Comebacks and collapses"
              subtitle="Points won after trailing at half-time, and points dropped after leading.">
          <ComebackTable profiles={profiles} clubs={clubs} />
        </Card>
      </div>

      <Card title="League table" subtitle="Click a column heading to sort, or a club for its page.">
        <StandingsTable standings={standings} clubs={clubs} />
      </Card>
    </div>
  );
}
