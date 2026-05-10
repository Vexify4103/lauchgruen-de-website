# QuizDuell

A real-time, browser-based Jeopardy-style gameshow built for Twitch streamers to host multi-participant quiz events.

- **1 host + up to 6 participants** per game
- **Twitch OAuth** for identity, **VDO.Ninja** for webcams (we don't host video)
- Real-time sync via **Socket.IO** on a custom Next.js server
- Each participant can capture `/obs/{gameId}` as an OBS Browser Source and restream

See [DEPLOY.md](./DEPLOY.md) for production hosting notes (Hetzner / Fly.io). **Vercel won't work** — we need WebSockets via a custom server.

## Quick start

```bash
pnpm install
cp .env.example .env.local       # then fill in Twitch credentials
pnpm dev                         # http://localhost:3000
```

You'll need a Twitch app (https://dev.twitch.tv/console/apps) with redirect URL:
```
http://localhost:3000/api/auth/callback/twitch
```

Generate `AUTH_SECRET` with `openssl rand -base64 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/` | anyone | Landing — sign in, host or join a game |
| `/lobby/{gameId}` | authed | Pre-game waiting room — webcam setup, ready check |
| `/host/{gameId}` | host | Game board with controls (pick / judge / open buzzers) |
| `/play/{gameId}` | participant | Game board, buzz button |
| `/obs/{gameId}` | spectator (no auth) | Clean transparent layout for OBS Browser Source |

OBS query params: `?hideself={twitchLogin}` `?compact=1`

## Adding questions

YAML files under `content/questions/`. One file per category:

```yaml
category: my_category_id
displayName: Display Name
questions:
  - points: 100
    prompt: "Question text?"
    imageUrl: /assets/question-images/foo.png  # optional
    answer: The answer
  - points: 200
    # ...
```

Point values are fixed at `100 / 200 / 300 / 400 / 500`.

## Architecture in 30 seconds

```
server.ts (custom Node entry)
├── Next.js  ← HTTP / SSR / OAuth callbacks
└── Socket.IO ← live game state, buzzer events
       ↑
       └── In-memory authoritative game store (src/server/game-state.ts)
```

The server is the source of truth. Every state mutation goes through it; clients render whatever it broadcasts. Question answers are stripped from payloads sent to non-host clients via `serializeFor()`.

Buzzer fairness: clients self-report `clientReactionMs` from the moment they receive `buzzers_opened`. The server collects buzzes for 300ms after the first one arrives, then picks the lowest reaction time. Not bulletproof (clients can lie), but eliminates ping-roulette for a friend-group game.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Socket.IO · next-auth (Auth.js v5) · js-yaml · Zod · pnpm.
