# Deploy

This app is the always-on public site. It no longer hosts the Quizshow or
Socket.IO; the live quiz app lives in `../Quizz`.

## Required Environment Variables

```txt
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_LINK_REDIRECT_URI=https://lauchgruen.de/api/twitch/callback
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
AUTH_SECRET
AUTH_URL=https://lauchgruen.de
NEXTAUTH_URL=https://lauchgruen.de
AUTH_COOKIE_DOMAIN=.lauchgruen.de
TOURNAMENT_APPLICATIONS_FILE=./data/tournament-applications.json
TOURNAMENT_ADMIN_TOKEN=
NEXT_PUBLIC_RIOT_AUTH_URL=
```

Register the Discord app callback:

```txt
https://lauchgruen.de/api/auth/callback/discord
```

Register the Twitch app callback:

```txt
https://lauchgruen.de/api/twitch/callback
```

## Fixed streamer smurf accounts

The fixed OBS overlays can follow multiple Riot accounts per streamer. Add
comma-separated Riot IDs; matching PUUIDs are optional because the app resolves
and stores them in MongoDB on first use:

```txt
LAUCHGRUEN_OBS_ALT_RIOT_IDS=
LAUCHGRUEN_OBS_ALT_RIOT_PUUIDS=
HIPPOKRATE_OBS_ALT_RIOT_IDS=
HIPPOKRATE_OBS_ALT_RIOT_PUUIDS=
HAPPYGIGANTO_OBS_ALT_RIOT_IDS=baby princess#twin
HAPPYGIGANTO_OBS_ALT_RIOT_PUUIDS=
NACHTDIENST_OBS_ALT_RIOT_IDS=
NACHTDIENST_OBS_ALT_RIOT_PUUIDS=
AKUMA_OBS_ALT_RIOT_IDS=
AKUMA_OBS_ALT_RIOT_PUUIDS=
N4CHT4R4_OBS_ALT_RIOT_IDS=
N4CHT4R4_OBS_ALT_RIOT_PUUIDS=
```

The two lists must use the same order when PUUIDs are supplied. HappyGiganto's
`baby princess#twin` account is also the built-in fallback when her Riot-ID list
is omitted.

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
  -e AUTH_URL=https://lauchgruen.de \
  -e NEXTAUTH_URL=https://lauchgruen.de \
  lauchgruen-web
```

`AUTH_SECRET` must be a stable random secret and must not change between
deploys unless all users are expected to sign in again. If you also set
`NEXTAUTH_SECRET` for compatibility, use the exact same value.

Do not set `AUTH_REDIRECT_PROXY_URL` for this deployment. It is only intended
for OAuth callbacks routed through a separate proxy deployment, not for the
normal tournament domain.

## Operational safety

Create a MongoDB backup before tournament migrations, archive/reset actions,
or large roster changes. Run `mongodump` from a host that can reach MongoDB and
write the archive outside the application container:

```bash
mongodump --uri="$MONGODB_URI" --archive="lauchgruen-$(date +%F-%H%M).archive" --gzip
```

Restore into a temporary database first and verify the archive before using it
against production. Keep at least one recent off-host copy.

Rotate `AUTH_SECRET`, Discord/Twitch client secrets, bot tokens, Riot API keys,
MongoDB credentials, and internal admin/event tokens whenever they have been
posted in chat, logs, screenshots, or issue trackers. Restart every app process
after rotation. Changing `AUTH_SECRET` invalidates existing login sessions.

After deployment, verify `/tournament/admin/status`. It intentionally exposes
only health and counter information to tournament owners, never credentials.

## Cloudflare and HTTPS

The application sends CSP, HSTS, Referrer-Policy, clickjacking protection, and
MIME-sniffing protection in production. Cloudflare must still redirect the
first unencrypted request before it reaches the application:

1. Set **SSL/TLS encryption mode** to **Full (strict)**.
2. Enable **SSL/TLS > Edge Certificates > Always Use HTTPS**.
3. Keep every `*.lauchgruen.de` service available over HTTPS because the app
   sends HSTS with `includeSubDomains`.
4. Do not enable HSTS preloading until every present and future subdomain has
   been audited. Preloading is intentionally not requested by the app.

After deploying, verify both schemes. The HTTP request must return a redirect,
and the HTTPS response must contain the security headers:

```bash
curl -I http://lauchgruen.de/
curl -I https://lauchgruen.de/
curl -I http://tournament.lauchgruen.de/
curl -I https://tournament.lauchgruen.de/
```

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
