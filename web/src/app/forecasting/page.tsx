import type { Metadata } from "next";
import { Card, Kpi } from "@/components/Card";
import { ModelGapChart } from "@/components/Charts";
import { CalibrationChart, ScorelineHeatmap, TeamEdgeChart, UpsetGallery } from "@/components/charts/ForecastCharts";
import { MatchesTable, ScoresTable } from "@/components/Tables";
import { pct } from "@/lib/format";
import {
  getCalibration, getClubIndex, getKpis, getMatches, getModelScores, getScorelines, getTeamProfiles, getUpsets,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Forecasting · Premier League 2025-26" };
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function ForecastingPage() {
  const [scores, kpis, calibration, scorelines, profiles, upsets, matches, clubs] = await Promise.all([
    getModelScores(), getKpis(), getCalibration(), getScorelines(), getTeamProfiles(), getUpsets(8), getMatches(), getClubIndex(),
  ]);
  const market = scores.find((s) => s.model === "market")!;
  const model = scores.find((s) => s.model === "poisson_xg")!;
  const modelBetter = profiles.filter((p) => p.llGap < 0).length;

  return (
    <div className="grid grid-cols-1 gap-4">
      <p className="max-w-3xl text-[14px] leading-relaxed text-ink-2">
        Every match got a probability for home win, draw and away win before kickoff. Log loss scores those
        probabilities: it punishes confident mistakes hardest, and lower is better. The market (closing odds with the
        bookmaker margin removed) is the benchmark to beat.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Market log loss" value={market.logLoss.toFixed(3)} detail={`Accuracy ${pct(market.accuracy)}`} />
        <Kpi label="Main model log loss" value={model.logLoss.toFixed(3)} detail={`Poisson on xG · accuracy ${pct(model.accuracy)}`} />
        <Kpi label="Gap to market" value={`+${(model.logLoss - market.logLoss).toFixed(3)}`}
             detail="Bigger than the 0.01 usually treated as noise" />
        <Kpi label="Market favourite won" value={pct(kpis.favouriteWinPct)} detail={`Model read ${modelBetter} of 20 clubs better than the market`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Models against the market"
              subtitle="Log loss gap to the closing odds over the season. Zero would mean matching the market; shorter is better.">
          <ModelGapChart scores={scores} />
          <div className="mt-4"><ScoresTable scores={scores} /></div>
        </Card>
        <Card title="Calibration" subtitle="Did a 60% forecast come true 60% of the time? Both sets of forecasts, all three outcomes of every match.">
          <CalibrationChart bins={calibration} />
        </Card>
      </div>

      <Card title="Biggest upsets" subtitle="The results the market rated least likely.">
        <UpsetGallery upsets={upsets} clubs={clubs} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Which clubs the model read better"
              subtitle="Average log loss per match of the model minus the market, over each club's 38 games.">
          <TeamEdgeChart profiles={profiles} clubs={clubs} />
        </Card>
        <Card title="Scorelines" subtitle="How often each score happened against how often the Poisson model expected it.">
          <ScorelineHeatmap cells={scorelines} />
        </Card>
      </div>

      <Card title="All matches"
            subtitle="Every result with xG and the probability the market and the main model gave to what happened. Click a heading to sort.">
        <MatchesTable matches={matches} />
      </Card>
    </div>
  );
}
