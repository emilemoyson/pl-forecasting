import { Card, Kpi } from "@/components/Card";
import { FinishingChart, ModelGapChart, PointsChart, RaceChart } from "@/components/Charts";
import { MatchesTable, ScoresTable, StandingsTable } from "@/components/Tables";
import { pct } from "@/lib/format";
import { getKpis, getMatches, getModelScores, getPointsRace, getStandings } from "@/lib/queries";

// Read from the database on each request (cached for an hour), not at build time,
// so the build does not need database access.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const RACE_TEAMS = 4;

export default async function Home() {
  const [standings, kpis, scores, matches] = await Promise.all([
    getStandings(),
    getKpis(),
    getModelScores(),
    getMatches(),
  ]);
  const raceTeams = standings.slice(0, RACE_TEAMS).map((s) => s.team);
  const race = await getPointsRace(raceTeams);

  const [champion, runnerUp] = standings;
  const market = scores.find((s) => s.model === "market");
  const mainModel = scores.find((s) => s.model === "poisson_xg");
  const gap = market && mainModel ? mainModel.logLoss - market.logLoss : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-8">
        <p className="text-[13px] font-medium text-ink-2">PL Forecasting · Season review</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
          Premier League 2025-26
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">
          Results, expected goals and forecast accuracy for all {kpis.matches} matches of the 2025-26 season,
          read live from a Postgres database. Forecasts were made walk-forward, one week at a time, using
          only information known before kickoff, and are compared against the closing odds of the betting market.
        </p>
      </header>

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
        {gap !== null && mainModel && (
          <Kpi label="Main model log loss" value={mainModel.logLoss.toFixed(3)}
               detail={`Poisson on xG, ${gap.toFixed(3)} behind the market (${market!.logLoss.toFixed(3)}); lower is better`} />
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Final points" subtitle="Points won by each team, in league order.">
          <PointsChart standings={standings} />
        </Card>
        <Card title="Results against xG" subtitle="Goal difference minus xG difference. Above zero means a team did better than the quality of chances for and against suggested.">
          <FinishingChart standings={standings} />
        </Card>
        <Card title="Title race" subtitle={`Cumulative points by games played, top ${RACE_TEAMS} teams.`}>
          <RaceChart race={race} teams={raceTeams} />
        </Card>
        <Card title="Models against the market"
              subtitle="Log loss gap to the closing odds over the season. Zero would mean matching the market; shorter is better.">
          <ModelGapChart scores={scores} />
          <div className="mt-4">
            <ScoresTable scores={scores} />
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="League table" subtitle="Click a column heading to sort.">
        <StandingsTable standings={standings} />
      </Card>

      <Card className="mt-4" title="All matches"
            subtitle="Every 2025-26 result with xG and the probability the market and the main model gave to what happened. Click a heading to sort.">
        <MatchesTable matches={matches} />
      </Card>

      <footer className="mt-8 text-[12px] leading-relaxed text-muted">
        Data: football-data.co.uk (results, closing odds), Understat (xG). Market probabilities use average closing
        odds with the margin removed proportionally. Models from the{" "}
        <a className="underline hover:text-ink" href="https://github.com/emilemoyson/pl-forecasting">pl-forecasting</a> repo.
      </footer>
    </main>
  );
}
