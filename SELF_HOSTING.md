# Running Quorum on a home server

Quorum needs no weather API keys. It does need sign-in settings, and it keeps
accounts and settings in a small database stored in a Docker volume.

Sign-in is **invite-only**: nobody can create an account from the website.
You add accounts with the `users` command below.

## 1. Pick the address and HTTPS

Sign-in cookies only work over **HTTPS** (or `http://localhost`). Easiest:
Tailscale. On the server run `tailscale serve --bg 3000`; it prints an address
like `https://myserver.tail1234.ts.net`. A reverse proxy (Caddy, Nginx Proxy
Manager, Cloudflare Tunnel) works too.

## 2. Configure

In the `Weather` folder create a file named `.env`:

```sh
BETTER_AUTH_URL=https://myserver.tail1234.ts.net
BETTER_AUTH_SECRET=<paste output of: openssl rand -hex 32>
```

`BETTER_AUTH_URL` must match the address in your browser exactly (no
trailing slash). The `.env` file is git-ignored; never commit it.

## 3. Start

```sh
git clone https://github.com/jawsweber18-beep/Weather.git
cd Weather
docker compose up -d --build
```

## 4. Add accounts

The database allows one process at a time, so stop the app while you manage
accounts:

```sh
docker compose stop
docker compose run --rm quorum npm run users -- add you@example.com 'a-strong-password' "Your Name"
docker compose start
```

Other commands (same `stop` / `run` / `start` pattern):

```sh
docker compose run --rm quorum npm run users -- list
docker compose run --rm quorum npm run users -- passwd you@example.com 'new-password'
docker compose run --rm quorum npm run users -- remove someone@example.com
```

## Updating

```sh
git pull && docker compose up -d --build
```

Accounts and settings live in the `quorum-data` volume and survive updates.

## What gets saved per account

Your current place, recent places, °F/°C, light/dark theme, and which forecast
sources you switched off. They follow you to any device you sign in on.

## Without Docker (Node.js 22+)

```sh
npm ci
npm run build:server
export PGLITE_DATA_DIR=$PWD/data BETTER_AUTH_URL=... BETTER_AUTH_SECRET=...
npm run users -- add you@example.com 'a-strong-password'   # app stopped
PORT=3000 node .output/server/index.mjs
```

## Hosting on Vercel instead

Vercel can't keep a database file, so attach a Postgres database (e.g. Neon)
and set `DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` in the
project's environment variables. Add accounts from any computer with
`DATABASE_URL=... npm run users -- add ...`.
