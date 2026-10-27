import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Kpi } from "@/components/Card";
import { Crest } from "@/components/Crest";
import { ResultStrip, XgTimeline } from "@/components/charts/TeamCharts";
import { TeamGamesTable } from "@/components/Tables";
import { getClubIndex, getPlayers, getStandings, getTeamGames, getTeamProfiles } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

type Props = { params: Promise<{ team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team } = await params;
  return { title: `${decodeURIComponent(team)} · Premier League 2025-26` };
}

const signed = (n: number, d = 1) => (n > 0 ? `+${n.toFixed(d)}` : n.toFixed(d));

export default async function ClubPage({ params }: Props) {
  const team = decodeURIComponent((await params).team);
  const [clubs, standings, profiles] = await Promise.all([getClubIndex(), getStandings(), getTeamProfiles()]);
  const club = clubs[team];
  if (!club) notFound();

  const [games, players] = await Promise.all([getTeamGames(team), getPlayers()]);
  const s = standings.find((r) => r.team === team)!;
  const p = profiles.find((r) => r.team === team)!;
  const squad = players.filter((pl) => pl.teams.split(", ").includes(team));
  const scorer = [...squad].sort((a, b) => b.goals - a.goals)[0];
  const creator = [...squad].sort((a, b) => b.assists - a.assists || b.xa - a.xa)[0];

  return (
    <div className="grid grid-cols-1 gap-4">
      <Link href="/teams" className="text-[13px] text-ink-2 hover:text-ink">← All teams</Link>
      <div className="flex items-center gap-4">
        <Crest badgeCode={club.badgeCode} code={club.code} team={team} size={72} />
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight text-ink">{team}</h2>
          <p className="text-[14px] text-ink-2">{club.stadium} · {club.area}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Finished" value={`${s.rank}${["th", "st", "nd", "rd"][((s.rank % 100) - 20) % 10] || ["th", "st", "nd", "rd"][s.rank % 100] || "th"}`}
             detail={`${s.points} points · ${s.won}-${s.drawn}-${s.lost}`} />
        <Kpi label="Points vs expected" value={signed(s.points - p.xpts)}
             detail={`${s.points} real, ${p.xpts.toFixed(1)} expected from chances`} />
        <Kpi label="xG per game" value={`${p.xgfPerGame.toFixed(2)} / ${p.xgaPerGame.toFixed(2)}`}
             detail="Created / conceded" />
        <Kpi label="Top scorer" value={scorer ? String(scorer.goals) : "-"}
             detail={scorer ? `${scorer.name}${creator ? ` · most assists: ${creator.name} (${creator.assists})` : ""}` : undefined} />
      </div>

      <Card title="Form guide" subtitle="Win, draw or loss in every league game, in order.">
        <ResultStrip games={games} clubs={clubs} />
      </Card>

      <Card title="Chances game by game" subtitle="xG created above the line, conceded below. The dark ticks are the actual goals.">
        <XgTimeline games={games} />
      </Card>

      <Card title="All games" subtitle={`Comebacks: ${p.comebackPoints} points won after trailing at half-time, ${p.blownPoints} dropped after leading.`}>
        <TeamGamesTable games={games} clubs={clubs} />
      </Card>
    </div>
  );
}
