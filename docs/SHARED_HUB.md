# Shared hosting coordination

The canonical multi-system hosting plan is:

`D:\Praveen\Projects\_multi-system-hub\SHARED_PLAN.md`

Claude (SeekandDestroy) owns the Azure VM, shared infrastructure, Docker
network, ingress, and deployment decisions. This repository owns only the
SimpleApp application and its Docker image.

## Hostnames (locked)

| Hostname | Served by | Notes |
|----------|-----------|-------|
| `praveenyzfr.com` | **Cloudflare Pages** | Static portfolio — 24×7, not this repo |
| `simpleapp.praveenyzfr.com` | Tunnel → SimpleApp on VM `:8082` | This app only while VM is up |

## SimpleApp routes on `simpleapp.praveenyzfr.com`

| Path | Purpose |
|------|---------|
| `/` | Public app landing (intro to SimpleApp / AutoCoder demo) |
| `/demo/` | Authenticated Users CRUD |
| `/api/health` | Landing-only health |
| `/api/users` | Auth + role enforced on the API (not UI-only) |

Local accounts: `viewer` / `editor` / `admin`. Session cookies are host-scoped
(no `Domain=.praveenyzfr.com`). No default credentials are committed — seed admin
comes from env at first boot; `.env` and `data/accounts.json` are gitignored.
