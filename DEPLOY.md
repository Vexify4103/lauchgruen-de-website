# Deploy

This app is the always-on public site. It no longer hosts the Quizshow or
Socket.IO; the live quiz app lives in `../Quizz`.

## Required Environment Variables

```txt
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
AUTH_SECRET
AUTH_URL=https://tournament.lauchgruen.de
AUTH_REDIRECT_PROXY_URL=https://tournament.lauchgruen.de/api/auth
NEXTAUTH_URL=https://tournament.lauchgruen.de
TOURNAMENT_APPLICATIONS_FILE=./data/tournament-applications.json
TOURNAMENT_ADMIN_TOKEN=
NEXT_PUBLIC_RIOT_AUTH_URL=
```

Register the Discord app callback:

```txt
https://tournament.lauchgruen.de/api/auth/callback/discord
```

## Docker

```bash
docker build -t lauchgruen-web .
docker run -d --name lauchgruen-web \
  -p 3000:3000 \
  -e TWITCH_CLIENT_ID=... \
  -e TWITCH_CLIENT_SECRET=... \
  -e DISCORD_CLIENT_ID=... \
  -e DISCORD_CLIENT_SECRET=... \
  -e AUTH_SECRET=... \
  -e AUTH_URL=https://tournament.lauchgruen.de \
  -e AUTH_REDIRECT_PROXY_URL=https://tournament.lauchgruen.de/api/auth \
  -e NEXTAUTH_URL=https://tournament.lauchgruen.de \
  lauchgruen-web
```

`AUTH_SECRET` must be a stable random secret and must not change between
deploys unless all users are expected to sign in again. If you also set
`NEXTAUTH_SECRET` for compatibility, use the exact same value.

## Caddy

Point the always-on domains at this app:

```txt
lauchgruen.de, www.lauchgruen.de, tournament.lauchgruen.de {
    reverse_proxy localhost:3000
}
```

Point the live quiz domains at the separate `Quizz` deployment when it is
online:

```txt
quiz.lauchgruen.de {
    reverse_proxy <quiz-host>:3000
}
```
