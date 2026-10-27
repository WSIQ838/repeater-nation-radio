# Voice server (Docker)

Self-hosted [LiveKit](https://livekit.io) server the radio app connects to
(`wss://voice.repeaternation.com`, see `src/lib/config.js`).

## Run
```bash
cd server
cp .env.example .env      # set a real key + secret
docker compose up -d
docker compose logs -f livekit
```

## Ports
| Port | Proto | Purpose | Expose via |
|------|-------|---------|-----------|
| 443 | TCP | wss signaling | Nginx Proxy Manager -> `<host>:7880` |
| 7880 | TCP | signaling (internal) | NPM only; don't open to the internet |
| 7881 | TCP | media fallback | forward router -> this host |
| 7882 | UDP | media | forward router -> this host |

## Nginx Proxy Manager
Proxy host `voice.repeaternation.com` -> `http` `<docker-host-ip>:7880`,
**Websockets Support on**, SSL cert + Force SSL. (Use the host's LAN IP;
with `network_mode: host` the container has no Docker DNS name.)

## Token server
The app gets its join token from the Repeater Nation backend. That backend
must sign tokens with the same `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.

## Troubleshooting
- Connects but no audio: forward 7881/tcp and 7882/udp, and keep
  `use_external_ip: true` (or set `node_ip`).
- Can't connect: check the NPM host has Websockets enabled.
- TURN isn't enabled; 443 is owned by NPM. Add TURN on its own domain/port if needed.
