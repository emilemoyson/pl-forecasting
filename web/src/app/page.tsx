import { Card, Kpi } from "@/components/Card";
import { ClubMapLoader } from "@/components/ClubMapLoader";
import { PointsChart, RaceChart } from "@/components/Charts";
import { pct } from "@/lib/format";
import { getClubs, getKpis, getModelScores, getPointsRace, getStandings } from "@/lib/queries";

// Read from the database on each request (cached for an hour), not at build time,
// so the build does not need database access.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const RACE_TEAMS = 4;

export default async function Overview() {
  const [standings, kpis, scores, clubs] = await Promise.all([getStandings(), getKpis(), getModelScores(), getClubs()]);
  const raceTeams = standings.slice(0, RACE_TEAMS).map((s) => s.team);
  const race = await getPointsRace(raceTeams);

  const [champion, runnerUp] = standings;
  const market = scores.find((s) => s.model === "market");
  const mainModel = scores.find((s) => s.model === "poisson_xg");

  return (
    <>
      <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-2">
        Results, expected goals, team styles, players and forecast accuracy for all {kpis.matches} matches of the
        2025-26 season, read live from a Postgres database. Forecasts were made walk-forward, one week at a time,
        using only information known before kickoff, and are compared against the closing odds of the betting market.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Champions" value={champion.team}
             detail={`${champion.points} points, ${champion.points - runnerUp.points} clear of ${runnerUp.team}`} />
        <Kpi label="Goals per match" value={kpis.goalsPerMatch.toFixed(2)}
             detail={`${kpis.goals.toLocaleString("en-US")} goals in ${kpis.matches} matches`} />
        <Kpi label="Expected goals per match" value={kpis.xgPerMatch.toFixed(2)}
             detail="Understat xG, home plus away" />
        <Kpi label="Home win rate" value={pct(kpis.homeWinPct)}
             detail={`Draws ${pct(kpis.drawPct)} · Away wins ${pct(kpis.awayWinPct)}`} />
        <Kpi label="Market favourite won" value={pct(kpis.favouriteWinPct)}
             detail="Outcome with the highest closing-odds probability" />
        {market && mainModel && (
          <Kpi label="Main model log loss" value={mainModel.logLoss.toFixed(3)}
               detail={`Poisson on xG, ${(mainModel.logLoss - market.logLoss).toFixed(3)} behind the market (${market.logLoss.toFixed(3)}); lower is better`} />
        )}
      </div>

      <Card className="mt-4" title="Where the clubs play"
            subtitle="Every 2025-26 club at its ground. Seven are in London and four more share two cities, so use the buttons to zoom in. Click a crest for its season.">
        <ClubMapLoader clubs={clubs} standings={standings} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Final points" subtitle="Points won by each team, in league order.">
          <PointsChart standings={standings} />
        </Card>
        <Card title="Title race" subtitle={`Cumulative points by games played, top ${RACE_TEAMS} teams.`}>
          <RaceChart race={race} teams={raceTeams} />
        </Card>
      </div>
    </>
  );
}
