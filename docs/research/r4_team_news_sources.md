# R4: Reliable team news sources and when they publish

Researched 2026-10-07 by the researcher agent. Feeds the news-checker (step 1.7) and later the news adjustments (step 4.3).

## 1. Question

Which sources give reliable Premier League team news (injuries, suspensions, likely starters), and when do they publish relative to kickoff and to our Friday 23:00 UTC push?

## 2. Short answer

The best primary sources are the managers' pre-match press conferences (Thursday and Friday before a weekend round), reported on official club sites and premierleague.com, plus the FPL API flags (`news`, `chance_of_playing_next_round`), which are only set once a club source confirms them. Confirmed line-ups only appear 75 minutes before kickoff, so they can never be in our Friday log. For MW6 the Sunday and Monday matches may have their press conferences after our push, so their news will be thinner.

## 3. Findings

### Timing

1. **Press conferences.** For a weekend round, some managers speak on Thursday and the rest on Friday. premierleague.com's weekly "This week in the Premier League" / "What's coming up this week" articles list this (for example https://www.premierleague.com/news/4127055, accessed 2026-10-07). Exact times differ by club and are not published in one official place. Managers whose game is on Sunday or Monday often speak a day or two later than the Saturday clubs; this is common practice I have seen reported, not a rule I found written down (medium confidence).

2. **Confirmed line-ups.** Clubs must submit their team sheet at least 75 minutes before kickoff, and since 2024-25 they may publish the XI and substitutes from that point (earlier than the old 60 minutes). Sources: Liverpool FC "Explained: Premier League changes for 2024-25 season" (https://www.liverpoolfc.com/news/explained-premier-league-changes-2024-25-season) and Man City "Premier League rule changes 2024/25" (https://www.mancity.com/news/mens/premier-league-rule-changes-202425-man-city-63859323), both accessed 2026-10-07. For MW6 the first XIs appear around 10:15 UTC on Sat 10 Oct, well after our push.

3. **FPL flags.** `bootstrap-static` `elements[]` has `news`, `news_added` (timestamp), `chance_of_playing_this_round` and `chance_of_playing_next_round` (we already store these). FPL only adds a flag once the player, his manager or the club confirms it; it ignores rumours. Flags are 0% (red, out), 25% or 50% (amber, doubtful) and 75% (yellow, slight doubt). Source: Fantasy Football Scout, "How do FPL players become unavailable", 20 July 2026 (https://www.fantasyfootballscout.co.uk/2026/07/20/how-do-fpl-players-become-unavailable), accessed 2026-10-07. Flags are updated through the week, most often after press conferences. The GW6 FPL deadline is Sat 10 Oct 10:00 UTC (from our raw `bootstrap_static.json`), so some updates will land after our Friday push.

### Sources, in order of reliability

| Tier | Source | What it gives | When |
|---|---|---|---|
| 1 | Official club websites (match preview / press conference report) | Manager's own words on injuries and fitness | Same day as the press conference |
| 1 | premierleague.com injury news page, https://www.premierleague.com/en/news/4242565/injury-news | Team-by-team absentee list, written for FPL managers | Updated through the week |
| 1 | premierleague.com match previews ("team news" section) | Per-match news | Usually after the press conferences |
| 2 | FPL API flags (`news`, `chance_of_playing_*`) | Machine-readable, confirmed-only | Through the week, before the deadline |
| 3 | BBC Sport and Sky Sports match previews, ESPN weekend team news round-ups | Team news summaries | Thu to Sat |
| 3 | Premier Injuries (https://www.premierinjuries.com/injury-table.php) | Injury table with expected return dates | Updated through the week |
| 4 | Aggregators: RotoWire, Squawka daily tracker | Quick cross-check | Varies |

Sources found by search on 2026-10-07 (premierleague.com, premierinjuries.com, espn.com, rotowire.com, squawka.com). The Athletic is reputable but paywalled, so it is a poor choice for a log that others must be able to check.

### MW6 specifics

- MW6 is the first round after an international break (MW5 ended on 20 Sep), so knocks picked up on international duty are a likely source of late news.
- Kickoffs (FPL feed): Sat 10 Oct 11:30, 14:00 and 16:30 UTC, Sun 11 Oct 13:00 and 15:30 UTC, Mon 12 Oct 19:00 UTC (Coventry City v Newcastle). The Monday teams in particular may not have held their press conference by Fri 23:00 UTC.

## 4. Confidence

**Medium.** The 75-minute rule and the FPL flag policy come from club sites and a specialist FPL site and are solid. The Thursday/Friday press conference pattern comes from premierleague.com's weekly articles. Exact publishing times for each outlet vary week to week and I could not open most pages directly from this network, so I relied on search results.

## 5. Suggestions

- Run the news-checker on Friday after about 15:00 UTC, when most Friday press conferences are done, and record for each row the source tier and whether that team's press conference had already happened.
- For teams playing on Sunday or Monday whose manager has not yet spoken, log the FPL flag and the latest official club news, and mark the row as "pre-press-conference".
