import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { FormWaves, LuckChart, StyleScatter } from "@/components/charts/TeamCharts";
import { DisciplineTable } from "@/components/Tables";
import { getClubIndex, getFormWaves, getStandings, getTeamProfiles } from "@/lib/queries";

export const metadata: Metadata = { title: "Teams · Premier League 2025-26" };
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function TeamsPage() {
  const [profiles, form, standings, clubs] = await Promise.all([
    getTeamProfiles(), getFormWaves(), getStandings(), getClubIndex(),
  ]);
  const order = standings.map((s) => s.team);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="How teams played" subtitle="Switch between quality of chances and style of play.">
          <StyleScatter profiles={profiles} clubs={clubs} />
        </Card>
        <Card title="Luck" subtitle="Real points against the points the chances deserved, from Understat expected points. Sorted from luckiest to unluckiest.">
          <LuckChart profiles={profiles} clubs={clubs} />
        </Card>
      </div>

      <Card title="Form waves"
            subtitle="Rolling six-game xG difference across the season. Blue above the line means a team was creating more than it allowed. Same scale for every club, in league order.">
        <FormWaves form={form} order={order} clubs={clubs} />
      </Card>

      <Card title="Shots, set pieces and discipline" subtitle="Per-game averages and season totals. Click a heading to sort.">
        <DisciplineTable profiles={profiles} clubs={clubs} />
      </Card>
    </div>
  );
}
