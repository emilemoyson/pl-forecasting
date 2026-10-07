# R3: Actual starts and minutes per player from the FPL API

Researched 2026-10-07 by the researcher agent. Needed in step 2.1 to score the news-checker against actual starts.

## 1. Question

After a gameweek, how do we read who actually started and how many minutes each player played, from the FPL API?

## 2. Short answer

Use one call per gameweek: `https://fantasy.premierleague.com/api/event/{gw}/live/`. Each player row has `stats.starts` (1 if in the starting XI, else 0) and `stats.minutes`, plus `explain[].fixture` to tie the row to a match. Wait until the gameweek shows `finished` and `data_checked` as true in `bootstrap-static` before settling. For double gameweeks, use `element-summary/{id}/` instead, which has one row per fixture.

## 3. Findings

All checks below were run on 2026-10-07 with one call to each endpoint (Matchweek 5 of 2026-27 and player id 1), saved only to a temporary folder.

1. **`/api/event/{gw}/live/`** returns `{"elements": [...]}`, one entry per player (667 for GW5). Each entry has:
   - `id`: player id (matches `bootstrap-static` `elements[].id`)
   - `stats`: gameweek totals, including `minutes`, `starts`, `goals_scored`, `assists`, `expected_goals`, `total_points` and a boolean `played`
   - `explain`: a list with one item per fixture the player's team played, each with `fixture` (fixture id) and point-scoring stats such as `{"identifier": "minutes", "value": 90}`
   - `modified`: whether FPL changed the stats after the fact
   Sanity check for GW5: `starts` summed to 220 = 10 matches x 22 starters. 220 players had `starts = 1`, 82 came off the bench (`starts = 0`, `minutes > 0`), 365 did not play. Every player, including unused ones, had an `explain` entry naming the fixture, so all players can be linked to a match.

2. **`/api/element-summary/{player_id}/`** returns `fixtures` (upcoming), `history` (this season, one row per fixture played by the team) and `history_past` (season totals). Each `history` row has `element, fixture, round, kickoff_time, was_home, opponent_team, minutes, starts, team_h_score, team_a_score, modified` and the other stats. Checked for player 1: GW5 row showed `fixture 42, round 5, minutes 90, starts 1`. Downside: one call per player (about 670 calls per refresh), so use it only when needed.

3. **`/api/bootstrap-static/`** (already downloaded by `src/collect/download_fpl.py`):
   - `elements[]` has season totals `starts` and `minutes`, and the player's current `team`.
   - `events[]` has `finished` and `data_checked` per gameweek. In our 2026-10-07 file GW5 had both true.

4. **Double and blank gameweeks.** In `event/{gw}/live`, `stats` are summed over all the player's fixtures that week, so `starts` can be 2. `explain` splits by fixture but only lists point-scoring stats, which include `minutes` but not `starts`. To know which of two matches a player started, use `element-summary` `history` rows. A team with no fixture that gameweek has no matching fixture to settle.

5. **Which team a player played for.** `bootstrap-static` gives the player's team today. After a January transfer that can differ from the team in an earlier gameweek. Safer: take the fixture id from `explain` (or `history`) and the side from `was_home` in `element-summary`, or join to `fixtures.json` and keep the player's team only if it is one of the two teams in that fixture.

6. **Status of the API.** The FPL API is not officially documented. Community docs describe the same endpoints and fields, for example https://github.com/curphey/fpl/blob/main/docs/API.md and https://www.oliverlooney.com/blogs/FPL-APIs-Explained (accessed 2026-10-07). Field names can change between seasons (the `starts` field is a fairly recent addition). Terms of use are task R7.

## 4. Confidence

**High.** The structure and the GW5 sanity check come from the live API itself today. Medium on double-gameweek behaviour, which I reasoned from the structure but could not test (GW5 was a single gameweek for every team).

## 5. Suggestions

- In step 2.1, after GW6 shows `finished` and `data_checked`, download `event/6/live/` once, save it unchanged to `data/raw/fpl/live/event_06.json`, and build `player_id, fixture_id, started (0/1), minutes` from `stats.starts`, `stats.minutes` and `explain[].fixture`.
- Add a sanity check: total starts = 22 x number of fixtures played that gameweek.
- Only call `element-summary` for players whose team has two fixtures in that gameweek.
