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

## Community OBS Overlay

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
