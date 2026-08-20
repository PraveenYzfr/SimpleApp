# Simple Users CRUD

Authenticated **Manage Users** demo for AutoCoder GenAI tests, hosted on
**Cloudflare Workers + D1** (always on). Express + JSON files remain as a local/VM
fallback.

## Hostnames

| Hostname | What |
|----------|------|
| `praveenyzfr.com` | Cloudflare Pages portfolio (separate repo) |
| `simpleapp.praveenyzfr.com` | **This app** on Cloudflare Workers |

## Stack

| Runtime | Tech |
|---------|------|
| Production | Cloudflare Workers + **Hono** + **D1** |
| Passwords | Web Crypto **PBKDF2** (Workers cannot load native `bcrypt`) |
| Sessions | Host-scoped signed cookie (HMAC) — never `Domain=.praveenyzfr.com` |
| Static UI | Vanilla HTML/CSS/JS under `public/` |
| Fallback | Express + JSON files (`npm start`) + `Dockerfile` |

## Paths

| Path | Purpose |
|------|---------|
| `/` | Public landing |
| `/demo/` | Authenticated Users CRUD |
| `/api/health` | Health `{ "status": "ok" }` |
| `/api/users` | Users API (auth + roles) |
| `/api/auth/*` | Login / logout / me |
| `/api/accounts` | Admin account CRUD |

## Cloudflare dashboard (Workers)

| Field | Value |
|-------|--------|
| Project name | `simpleapp` |
| **Build / deploy command** | `npx wrangler deploy` |
| Install command | `npm ci` (or default `npm install`) |
| Root directory | `/` (repo root) |

### One-time setup (before first deploy)

```bash
npm install
npx wrangler login
npx wrangler d1 create simpleapp
```

Copy the printed `database_id` into `wrangler.toml` under `[[d1_databases]]`.

```bash
npm run cf:db:migrate
npx wrangler secret put SESSION_SECRET
npx wrangler secret put AUTH_ADMIN_EMAIL
npx wrangler secret put AUTH_ADMIN_PASSWORD
npx wrangler secret put AUTH_ADMIN_NAME
npm run cf:deploy
```

Then attach custom domain `simpleapp.praveenyzfr.com` in the Cloudflare Workers UI.

### Local Worker preview

```bash
cp .dev.vars.example .dev.vars
npm run cf:db:migrate:local
npm run cf:dev
```

## Roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read managed users only |
| `editor` | Full users CRUD |
| `admin` | Users CRUD + manage login accounts |

## Express fallback (optional)

```bash
cp .env.example .env
npm start
```

Opens on port `8082`. Uses bcrypt + JSON files — not used in production Cloudflare deploys.

## Project layout

```
src/index.js              Worker entry (assets + API)
src/app.js                Hono API (auth / users / accounts)
src/password.js           PBKDF2
src/session.js            Signed cookie + CSRF
schema.sql                D1 tables + user seed
wrangler.toml             Worker + D1 + assets
public/                   Landing + demo UI
server.js                 Express fallback
Dockerfile                VM fallback (kept)
docs/CLOUDFLARE_MIGRATION.md
```

## Cookie / security notes

- Cookie name `simpleapp.sid`, **host-scoped only**
- CSRF via `X-CSRF-Token` (value from login / `/api/auth/me`)
- Rate limiting: configure at Cloudflare edge (not in-app)
- No default credentials in git; admin seeds from secrets when `accounts` is empty
