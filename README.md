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
