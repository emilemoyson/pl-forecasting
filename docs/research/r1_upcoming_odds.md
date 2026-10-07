# R1: Bookmaker odds for upcoming matches, before kickoff

Researched 2026-10-07 by the researcher agent. Urgent for Matchweek 6 (first kickoff Sat 10 Oct 2026, 11:30 UTC).

## 1. Question

Where can we get bookmaker odds for the coming matchweek before kickoff, for free? Which columns, how often are they updated, and what are the terms? In particular: can we capture Bet365 pre-match odds (used for paper bets) and market average odds (the benchmark) before kickoff?

## 2. Short answer

Yes. football-data.co.uk publishes a free upcoming-fixtures file, `https://www.football-data.co.uk/fixtures.csv`, with odds for weekend games collected on Friday afternoon (by 17:00 UK time, which is 16:00 UTC this week). It carries the same pre-match columns as the season files, including `B365H, B365D, B365A` and `AvgH, AvgD, AvgA`, so download it once on Fri 9 Oct between about 16:00 and 22:00 UTC and keep rows with `Div == "E0"`. Market average **closing** odds (`AvgCH, AvgCD, AvgCA`) cannot be captured before kickoff by definition: they appear in the season file `E0.csv` after the matches and are used only for scoring. One practical risk: on the network used today, football-data.co.uk is blocked by a web filter (category "gambling"), so Friday's download must run from a network that allows it.

## 3. Findings

### football-data.co.uk (primary source)

1. **The file exists and covers this weekend.** football-data's fixtures page links a CSV of upcoming fixtures with odds for all the leagues it covers: `https://www.football-data.co.uk/fixtures.csv` (link listed on https://www.football-data.co.uk/matches.php, seen through search results, accessed 2026-10-07). A second page, `matches_new_leagues.php`, covers the extra leagues and is not needed here. Filter to `Div == "E0"` for the Premier League.

2. **When it is updated.** Odds for weekend fixtures are collected on Friday afternoons, generally no later than 17:00 UK time. Midweek fixtures are collected on Tuesdays, no later than 13:00 UK time. Source: football-data `notes.txt` and `matches.php`, as returned by search on 2026-10-07 (https://www.football-data.co.uk/notes.txt). The site says "British Standard Time"; in October the UK is on BST (UTC+1) until Sun 25 Oct 2026, so 17:00 UK = **16:00 UTC** on Fri 9 Oct. After 25 Oct it becomes 17:00 UTC.

3. **Columns.** A search snippet of the file's header (accessed 2026-10-07) shows it starts `Div, Date, Time, HomeTeam, AwayTeam` followed by bookmaker 1X2 columns such as `B365H/D/A`, then `MaxH/D/A` and `AvgH/D/A`, plus over/under 2.5 and Asian handicap columns. The exact bookmaker list changes by season. Our own raw 2026-27 season file (`data/raw/football_data/E0_2627.csv`, downloaded 2026-10-03) shows which bookmakers football-data collects this season for the pre-match set: `B365, BFD, BV, BW, PP, SKB, Max, Avg, BFE` (BFE is the Betfair exchange). There is **no Pinnacle (`PSH`) column in 2026-27**, which matches `docs/decisions.md`. The fixtures file should carry the same set, but this was not checked directly (see confidence). Columns we need:
   - Paper bets: `B365H, B365D, B365A`
   - Pre-kickoff market log: `AvgH, AvgD, AvgA` (and `MaxH, MaxD, MaxA` for the upper-bound check)

4. **Pre-match vs closing.** Since 2019-20 football-data records two sets of odds per match. The first set is collected after the market opens, at the times stated on the fixtures page (that is, the Friday snapshot in `fixtures.csv`). The second set is the closing odds, marked with a `C` in the column name (`B365CH`, `AvgCH`, ...). Source: `notes.txt` via search, accessed 2026-10-07. Implication: the `B365H` and `AvgH` values that later appear in `E0.csv` should be the same Friday snapshot we log from `fixtures.csv`. That gives a free consistency check after the weekend.

5. **When closing odds become available.** The season files are updated at least twice a week, on Sunday and Wednesday nights (football-data `data.php`, via search, accessed 2026-10-07). So Saturday and Sunday closing odds should be in `E0.csv` from Sunday night, and the Monday 12 Oct match (Coventry v Newcastle) from Wednesday night, 14 Oct.

6. **Kickoff times are UK local time, not UTC.** Checked locally on 2026-10-07: `E0_2627.csv` lists Leeds v Crystal Palace on 20/09/2026 at `14:00`, while the FPL fixtures feed has that slot at `2026-09-20T13:00:00Z`. So football-data's `Time` column is Europe/London time and must be converted to UTC (CLAUDE.md rule). Dates are `dd/mm/yyyy`.

7. **Terms of use.** I could not open football-data's own pages to read any terms (blocked, see next point). Search results describe the site as offering its CSV files free of charge. Football DataCo (the leagues' data rights company) licenses official data to betting companies (https://football-dataco.com/betting-data-licence-requirements, accessed 2026-10-07); that is aimed at commercial betting operators, not a non-commercial research project, but this is my reading, not a legal check. Full terms are research task R7.

8. **Network block (practical risk).** On 2026-10-07 both `https://` and `http://` requests to www.football-data.co.uk from this machine returned a filter page: "Web Page Blocked ... Category: gambling". The season files were downloaded fine on 2026-10-03, so that was probably a different network. Bookmaker and odds API sites are likely to fall in the same filter category. I did not try to get around the filter.

### Free alternatives (fallbacks)

9. **The Odds API** (https://the-odds-api.com). Free "Starter" plan with 500 credits per month, no card needed. One live odds call costs (number of markets) x (number of regions), so 1X2 (`h2h`) for regions `uk,eu` costs 2 credits per call. Sport key `soccer_epl`. The UK list includes William Hill, Paddy Power, Sky Bet, Ladbrokes, Betfair exchange, Betway and others; the EU list includes Pinnacle. **Bet365 is not listed.** Historical odds are paid only and cost 10x. Sources: the-odds-api.com bookmaker and EPL pages, and a third-party blog (oddspapi.io) that also says the free plan was changed on 26 July 2026; all via search, accessed 2026-10-07. The plan details come partly from a competitor's blog, so treat them as medium confidence. Needs an API key that Emile would register himself. Its average over its own bookmakers is not the same as football-data's `Avg`, so it is a fallback for the market log only, not a replacement for Bet365.

10. **API-Football and similar APIs** (API-Football, odds-api.io, TheStatsAPI, Sportmonks). Third-party blogs say API-Football's free tier gives a daily pre-match odds snapshot, odds-api.io has a free tier, TheStatsAPI is a 7-day trial then paid, and Sportmonks sells odds as a paid add-on (search results, accessed 2026-10-07). I did not verify bookmaker coverage or which seasons the free tiers allow. All need an account. Low confidence; not worth setting up this week.

11. **Odds comparison websites** (OddsPortal, Oddschecker). They show Bet365 and averages, but getting the numbers means scraping pages, which their terms generally do not allow and which goes against the project's "be polite" rule. Not recommended.

### What can be captured before kickoff

| Need | Column | Before kickoff? | How |
|---|---|---|---|
| Paper bet price | `B365H/D/A` | Yes | `fixtures.csv`, Friday snapshot |
| Pre-kickoff market log | `AvgH/D/A` | Yes | `fixtures.csv`, Friday snapshot |
| Benchmark (decisions.md) | `AvgCH/CD/CA` | No, by definition | `E0.csv` after the matches (Sun/Wed night updates) |
| Closing line value | `B365H` vs `AvgCH` | Bet365 side yes, closing side later | as above |

Using closing odds that are published after kickoff is not leakage. They are prices set before kickoff, and they are only the benchmark we score against, never a model input (golden rule 3).

## 4. Confidence

**Medium-high** that `fixtures.csv` is the right free source and will have Bet365 and market average pre-match odds for MW6 by Friday 16:00 UTC. The file, its Friday timing and the two-set odds design all come from football-data's own pages, but I only saw them through search snippets because the site is blocked here. The column list is inferred from a header snippet plus our 2026-27 season file, not from today's `fixtures.csv`. I am less sure (medium) that Friday's file includes the Monday night match; it usually covers everything up to the next update, but check that all 10 MW6 matches are there.

## 5. Suggestions

- Fri 9 Oct, between 16:00 and 22:00 UTC: download `fixtures.csv` once, from a network that allows football-data, and save it unchanged as a new timestamped raw file (for example `data/raw/football_data/fixtures_2627_mw06_<UTC time>.csv`), never overwriting earlier weeks. Keep `Div == "E0"`, map team names, check all 10 MW6 fixtures are present, check the needed columns exist by name, record `odds_collected_at_utc`, convert `Time` from UK time to UTC.
- Before Friday: confirm the machine/network that will run the pipeline can reach football-data.co.uk.
- After the weekend: check that the logged `B365H/AvgH` values equal the `B365H/AvgH` values in the refreshed `E0.csv`.
- Fallback if `fixtures.csv` is late or missing MW6 rows: The Odds API free key (`h2h`, `uk,eu`, 2 credits per call) for the market log only, and no paper bets that week (no Bet365).
