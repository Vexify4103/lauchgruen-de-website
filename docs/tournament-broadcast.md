# Tournament Broadcast Sources

Open `/obs/broadcast` on either website host (or localhost) for the source builder.
It is also linked in `/admin/live` and beside each team's existing OBS button.
Sources do not require a login and never expose draw/reset/result controls.

## Sources

| OBS URL                                | Purpose                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `/obs/swiss-draw`                      | Full-screen Swiss draw, controlled privately in the existing live cockpit |
| `/obs/tournament-board`                | Active rounds, public results, standings and final playoff seeds          |
| `/obs/match-bar?team=TEAM_ID`          | Compact transparent match bar that follows one team                       |
| `/obs/tournament-waiting?team=TEAM_ID` | Opponent, round, scheduled time and captain readiness                     |
| `/obs/champ-select?team=TEAM_ID`       | Spectator scene with locked blue/red picks and bans                       |

All scenes use a **1920 x 1080** canvas, scaled proportionally for browser previews.
Set the OBS browser source to that size and leave its custom CSS empty. There is
no website navigation, creator credit or normal website footer on these sources.
Full-screen scenes fill the entire canvas edge to edge with a dark background;
only the content has safe-area padding. The match bar leaves the rest of the
canvas transparent. The bar defaults to top-center to leave the
League HUD free; `position=bottom` moves it to bottom-center.

Select a team in the builder to generate a URL with the same public team ID used
by `/obs/tournament?team=TEAM_ID`. The stored overlay ID remains unchanged when
the display name changes. Internal storage keys are still used for match history
and draw identity, but no longer appear in newly copied URLs. Early broadcast
links containing storage keys remain accepted when there is no matching public ID.
Without a team selection, the source prefers the marked cast match. A specific
public match can be pinned with `match=MATCH_ID`; pinned sources intentionally do
not advance to another match. Team/match mismatches return 404 rather than showing
someone else's match.

## Host Workflow

1. Add `/obs/swiss-draw` as the broadcast scene in OBS.
2. Use `/admin/live` privately to draw teams. OBS only mirrors saved selections.
3. Switch to the tournament board, then the champ-select scene or match bar.
4. Continue using existing match-control buttons for draft release, results and
   Discord announcements. OBS performs none of those actions itself.

The draw scene cycles only the eligible remaining teams in the active pool. It
uses the existing server-authoritative reel, masks unrevealed names, and queues
draws received between polls. Forward-slot rematch protection preserves the
server's assigned destination. A new connection or refresh shows the current
board without replaying historical draws. Sources poll independently, so reveal
start times can differ slightly; this is not a frame-synchronized video feed.

For continuous draw playback, keep the browser source loaded between OBS scenes.
If OBS unloads/reloads it, restoring the latest board without historical animation
is deliberate. The page never redraws a team on reconnect.

## Safe Preview

Add `demo=1` to any source URL, or enable **Demodaten statt Turnierdaten** in the
builder. These previews use deterministic fake data, display a prominent demo
label and do not access the tournament database. The demo draw advances itself
through fake selections. Refresh starts that demonstration again.

To mirror the existing interactive local fake-team simulator instead, use:

```text
http://localhost:3000/obs/swiss-draw?source=sandbox
```

Control it from `/swiss-draw-test`. The sandbox source is enabled only for local
development and uses the separate local simulator database. It cannot be enabled
on production by passing a query flag. It does not change live tournament records.

## Data and Failure Handling

- Only published teams are exposed. Private roster drafts, player/Discord IDs,
  captain identity references, admin notes and audit metadata are excluded.
- Champ select displays locked picks/bans, never pending selections, hovers or
  unconfirmed role assignments. A paused draft hides the draft scene's picks.
- Draft A/B are the existing blue/red draft sides, not roster A/B; team labels and
  waiting-screen readiness follow the actual match side selection.
- Completed placement Swiss uses the existing final seed order, not a misleading
  global sort by wins (some seeds played three games, others four).
- `/api/obs/tournament-broadcast` is GET-only and responds `no-store`. Backend
  snapshots and draft reads are briefly shared/coalesced across browser sources.
- New sources add no authenticated Riot/Twitch API calls. Champion pictures use
  the existing Data Dragon catalog/CDN, not Riot API keys.
- A temporary connection error retains the last confirmed snapshot with a visible
  warning and backs off retries. Invalid/deleted selections do not silently fall
  back to another team's match.
- The existing draw/result and redraw/start races are unchanged by this feature.

Checks:

```powershell
pnpm typecheck
pnpm test
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/tournament-broadcast*.test.mjs
```

Unit/route/render tests are not a substitute for a final visual OBS/browser test.
