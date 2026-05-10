# Deploy

This project **cannot run on Vercel** — it uses a custom Node server with Socket.IO over WebSockets. Target: a single VM (Hetzner CX11 / Fly.io shared-cpu-1x is plenty for 6 players + a handful of OBS clients).

## Required environment variables

```
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
AUTH_SECRET             # openssl rand -base64 32
NEXTAUTH_URL            # full public URL, e.g. https://quizduell.example.com
PORT=3000               # optional, defaults to 3000
HOSTNAME=0.0.0.0        # bind all interfaces in container
```

Register the app at https://dev.twitch.tv/console/apps with redirect:
```
{NEXTAUTH_URL}/api/auth/callback/twitch
```

## Docker

```bash
docker build -t quizduell .
docker run -d --name quizduell \
  -p 3000:3000 \
  -e TWITCH_CLIENT_ID=... \
  -e TWITCH_CLIENT_SECRET=... \
  -e AUTH_SECRET=... \
  -e NEXTAUTH_URL=https://quizduell.example.com \
  quizduell
```

The container exposes a `/api/health` endpoint used by the built-in `HEALTHCHECK`.

## Hetzner (single VPS, behind Caddy)

Caddyfile snippet:
```
quizduell.example.com {
    reverse_proxy localhost:3000
}
```
Caddy auto-handles TLS and websocket upgrade for `/socket.io/`. No extra config needed.

## Fly.io

`fly.toml` (minimal):
```toml
app = "quizduell"
primary_region = "fra"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false   # keep alive — disconnects break the live game
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[[services]]
  protocol = "tcp"
  internal_port = 3000
  [[services.ports]]
    handlers = ["http"]
    port = 80
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
  [services.concurrency]
    type = "connections"
    hard_limit = 200
    soft_limit = 100
```

Set secrets:
```
fly secrets set \
  TWITCH_CLIENT_ID=... \
  TWITCH_CLIENT_SECRET=... \
  AUTH_SECRET=... \
  NEXTAUTH_URL=https://quizduell.fly.dev
```

## Notes for v1

- **In-memory state.** Restarting the server drops the active game. Keep the process alive during a stream.
- **Single instance only.** No Redis adapter — don't horizontally scale.
- **VDO.Ninja is external.** No video traffic hits this server. Each participant publishes from their own browser tab; everyone else's browser fetches the view URL straight from VDO.Ninja's network.
