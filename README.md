# lauchgruen.de

Always-on public website for lauchgruen.

- `lauchgruen.de` serves the streamer landing page.
- `tournament.lauchgruen.de` serves the tournament hub.
- `quiz.lauchgruen.de` is hosted by the separate `../Quizz` app.

## Quick Start

```bash
pnpm install
pnpm dev
```

Local URLs:

```txt
http://lauchgruen.localhost:3000
http://tournament.lauchgruen.localhost:3000
```

Discord OAuth is used for tournament applications. Twitch API credentials are
used for the public live-status card.

## Local Swiss Pot Draw

Start Docker's `lauchgruen-local-mongo` container (host port `27027`) and the dev server.
Open [the fake-team simulator](http://localhost:3000/swiss-draw-test).
No Discord login is needed for this local-only page. It returns 404 in production.

Each click draws one of eight invented teams into a visible slot. Within a pool,
the first half faces the second half (A-E, B-F, C-G, D-H; or A-C, B-D).
Previous opponents are skipped by moving the newly drawn team to the next valid
free slot, while checking that the undrawn teams can still fill the remaining slots.
Two-team pools are automatic. Pick test winners to progress through four rounds.
If a fourth-round placement pairing requires a rematch, the simulator stops for
explicit approval instead of crossing score pools.

The active slot cycles through undrawn team names in the current record pool,
showing one name at a time, slowing down and landing on the server's result.
Other slots stay still. The selected team then fills its valid slot and disappears
from that pot. A one-team pot uses a short final reveal,
and reduced-motion preferences skip the spinning. The result is already saved on
the server, so refreshing during the animation never draws a second team.

State survives refreshes in the **separate local database**
`lauchgruen_swiss_draw_sandbox`, collection `swiss_pot_sessions`.
It never reads or changes actual rosters, applications, live pairings, or Riot/Discord data.
`LOCAL_SWISS_MONGODB_URI` optionally changes the loopback connection; remote hosts
are rejected. Reset affects only this simulator.

Optional local database integration checks:

```powershell
$env:LOCAL_SWISS_DB_TEST="1"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/swiss-pot-sandbox.test.mjs
```

## Live Swiss Team Draw

The owner-only live cockpit (`/admin/live` on the tournament host) uses the same
one-team slot draw for eight-team, four-round placement Swiss with all eight teams
advancing. `/admin/swiss-test` can exercise that workflow with test winners and no
live match writes. Other formats retain their existing draw flow.

The live API uses current published team keys/names, stores visible slots in
`tournament_swiss_stages`, and logs draws in `tournament_swiss_audit` and the admin
audit. Completed pots create normal `swiss-rN-mN` scheduled matches; draft release,
Discord notifications and result entry still use the normal match controls.
An atomic stage update plus a retryable match outbox handles interrupted match
creation without replacing existing results. Stale requests are rejected instead
of consuming another team. Seeded first rounds stay deterministic and are labelled
as such, without a fake random animation.

Existing completed rounds are preserved. A partially revealed legacy round must
finish its old match-by-match flow before the next round uses team slots. Fourth-round
placement rematches require explicit approval; score pools are never crossed.

Run real-service integration tests only against a loopback Mongo server. They use
and remove their own randomly named test database, not `.env.local` or live data:

```powershell
$env:SWISS_DB_TEST_URI="mongodb://127.0.0.1:27027/?directConnection=true"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ./tests/setup/alias.mjs --test tests/swiss-live-pot-db.test.mjs
```

Independent review handoff: [Claude verification prompt](docs/claude-swiss-draw-verification.md).

## Community OBS Overlay

Tournament hosts and participating streamers can configure five dedicated broadcast
sources at `/obs/broadcast`: Swiss draw, tournament board, match bar, waiting screen
and spectator champ select. See [the broadcast guide](docs/tournament-broadcast.md)
for 1920 x 1080 setup, team-following links, safe demo mode and local simulator mirroring.

The public builder at `https://lauchgruen.de/overlay` uses dedicated API
credentials so its traffic cannot consume the tournament API budget:

```env
RIOT_OVERLAY_API_KEYS=
TWITCH_OVERLAY_CLIENT_ID=
TWITCH_OVERLAY_CLIENT_SECRET=
```

`RIOT_API_KEY` and `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` remain reserved
for tournament features, account linking, and the main site. The Twitch overlay
credentials are only required when a generated community overlay tracks a
Twitch channel.

Signed-in users can store up to 12 named overlay presets. Presets contain only
the normalized overlay query and remain scoped to the Discord account. The OBS
URL stays self-contained and can still be used without an active login.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Optional route smoke tests run against an already running deployment:

```powershell
$env:SMOKE_BASE_URL="http://localhost:3000"
pnpm test:smoke
```

Tournament owners can inspect MongoDB latency, Riot key availability, Discord
queue state, and in-process overlay cache/error counters at
`/tournament/admin/status`.
