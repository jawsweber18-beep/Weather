# Running Quorum on a home server

Quorum needs no API keys or database; it only needs outbound internet
access to the public weather services.

## Option A: Docker (recommended)

```sh
git clone https://github.com/jawsweber18-beep/Weather.git
cd Weather
docker compose up -d --build
```

Open `http://<server-ip>:3000`. It restarts automatically after reboots.

Update to the latest code:

```sh
git pull && docker compose up -d --build
```

## Option B: plain Node.js (22+)

```sh
npm ci
NITRO_PRESET=node-server npx vite build
PORT=3000 node .output/server/index.mjs
```

Keep it running with systemd, pm2, or similar.

## Using it from your phone

- On home Wi-Fi: `http://<server-ip>:3000`.
- Away from home: put it behind Tailscale (open `http://<tailscale-name>:3000`)
  or a reverse proxy with HTTPS (Caddy, Nginx Proxy Manager, Cloudflare Tunnel).
- "Use my location" and "Add to Home Screen" need HTTPS in most browsers, so a
  Tailscale HTTPS cert (`tailscale serve`) or a reverse proxy is worth setting up.
