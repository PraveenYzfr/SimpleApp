# SimpleApp -> Cloudflare (Pages Functions + D1)

**Decision: Praveen, 2026-08-17.** SimpleApp moves off its planned Azure VM slot onto Cloudflare.
Written by Claude (SeekandDestroy / deployment owner) for the agent that owns this repo. **Nothing
here has been applied — no code in this repo has been changed.** Hub plan: sections 7a / 7c / 7e of
`D:\Praveen\Projects\_multi-system-hub\SHARED_PLAN.md`.

## Cost: nothing

Cloudflare's free tier covers this comfortably — Pages static is unmetered, Pages Functions allow
100k requests/day, D1 allows 5 GB and millions of row-reads/day. A demo CRUD app will not approach any
of those. If it ever did, Workers Paid is $5/month. **No new spend to approve.**

## Why

SimpleApp is the one app in the estate a stranger clicks **unattended** — it is linked from
`praveenyzfr.com`, which is already live on Cloudflare Pages. The other systems (SAD, MDT, GENIE) sit
on an Azure VM that is **deallocated when not in use** (~$44/mo instead of ~$144), so they are dark
most of the time. That is fine for apps demoed deliberately; it is bad for the one a recruiter clicks
at 9pm. A dead demo link reads as abandoned work.

Moving also removes SimpleApp from the shared VM entirely: no container, no named volume, no
memory/CPU limits, no port 8082, and — the one that actually mattered — **no way for an unbounded
`fs.writeFileSync` to fill the host disk and take SQL Server down with all three other systems.** That
risk is deleted rather than mitigated.

## What breaks — read this first

Workers are V8 isolates, not Node. **No filesystem, no long-lived process, no native addons, no shared
memory between requests.** Six of seven runtime dependencies do not survive:

| dependency | survives? | why / replacement |
|---|---|---|
| `express` | NO | needs Node `http` + a listening server -> **Hono** (near-identical routing API) |
| `bcrypt` ^6.0.0 | NO | **native C++ addon — cannot load on Workers.** The sharp edge; see below |
| `express-session` | NO | server-side session objects; no process to hold them |
| `session-file-store` | NO | writes `data/sessions/*.json`; there is no disk |
| `express-rate-limit` | NO | in-memory per-process; isolates share nothing -> **Cloudflare edge rate limiting**, free and better |
| `dotenv` | NO | -> Workers **bindings + secrets** (`wrangler secret put`) |
| `uuid` | yes | works, but `crypto.randomUUID()` is built in — drop the dep |

**`bcrypt` is the item to plan around.** It is a compiled native module. Options, best first:

1. **Web Crypto PBKDF2** (`crypto.subtle.deriveBits`) — built into the runtime, no dependency, fast.
   Requires **rehashing existing account passwords**, so plan a migration or reset the accounts.
2. `bcryptjs` — pure JS, drop-in API, but slow enough at a high work factor to approach the Worker CPU
   limit. Acceptable at this scale; measure it.

Do not discover this at deploy time. It is the single most likely thing to derail the port.

## Storage — two layers, not one

I had assumed storage sat behind `lib/accountsStore.js`. **It does not.** There are two independent
stores:

- `lib/accountsStore.js` -> `data/accounts.json` (auth accounts)
- `routes/users.js` -> `data/users.json`, with `fs` calls **inline in the route file** (lines 2, 15, 20)

Both become **D1** (SQLite). The second needs the route rewritten as well as the storage swapped,
which is why this is not a one-file change.

Suggested schema — keep it boring:

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
```

Seed both from the current JSON files so the demo keeps its data.

## Sessions — the largest single item

Today: `express-session` + `session-file-store`, with `req.session.accountId` and a CSRF token held
server-side (`middleware/auth.js`). None of that model exists on Workers.

**Recommended: stateless signed cookie (JWT or signed session cookie).** It deletes the session store
rather than porting it — no KV, and no eventual-consistency window where a just-logged-in user appears
logged out. `HttpOnly`, `Secure`, `SameSite=Lax`, short TTL, signed with a Worker secret.

**CSRF:** keep a double-submit token, but derive it from the signed cookie instead of storing it
server-side.

**Alternative:** Cloudflare KV as a session store — closer to the current code, but eventually
consistent, and it keeps a storage dependency you do not need.

### Cookie scope — non-negotiable (hub section 7b, rule 2)

Scope the session cookie to **`simpleapp.praveenyzfr.com` exactly**. Never `Domain=.praveenyzfr.com`.
A domain-wide cookie removes origin isolation for the whole estate — the portfolio, SAD, everything on
that apex — not just for SimpleApp.

## Target shape

One Pages project. No separate Worker to manage; `functions/` becomes the API automatically.

```
public/landing/             static, served by Pages
public/demo/                static, served by Pages
functions/api/[[route]].js  Hono app (users, accounts, auth)
wrangler.toml               D1 binding, secrets
schema.sql                  tables + seed
```

## Express -> Hono, concretely

```javascript
// before
router.get('/', (req, res) => { res.json(readUsers()); });

// after
users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM users').all();
  return c.json(results);
});
```

Four differences and that is all of them: `(req,res)` -> `(c)`; `res.json(x)` -> **`return c.json(x)`**;
`req.body` -> `await c.req.json()`; `fs` -> `c.env.DB`. `middleware/auth.js` maps onto Hono's
`app.use()` unchanged in concept. Hono also runs on Node/Deno/Bun, so this is not a lock-in — if
SimpleApp ever returns to a VM it runs there as-is.

## Suggested order

1. `wrangler.toml` + D1 database + `schema.sql`, seeded from the current JSON. Verify with
   `wrangler d1 execute`.
2. **Password hashing first** — pick PBKDF2 or bcryptjs and prove it round-trips before anything else.
   Everything else is mechanical; this one can invalidate the plan.
3. Sessions -> signed cookie. Port `middleware/auth.js`, keep the same role semantics.
4. `routes/users.js` and `lib/accountsStore.js` -> D1 queries.
5. Express -> Hono, mounted under `functions/`.
6. Delete `express-rate-limit`; configure rate limiting at Cloudflare instead.
7. `wrangler dev` locally, then deploy to a preview URL before pointing `simpleapp.praveenyzfr.com`.

## Effort — revised upward, honestly

First estimate was **~1 day**, assuming storage sat behind one module. Having read the repo:
**2-3 days.** Two reasons: `bcrypt` is a native addon, and `routes/users.js` does its own file I/O
rather than going through the store. ~1,265 lines of JS total, roughly half of it touched.

## What does NOT change

- The landing `/` + demo `/demo/` split (hub section 7e — repo wins, this stays)
- Roles: viewer / editor / admin
- The `Dockerfile` — **keep it.** It is the fallback if this port stalls, and the VM slot can be
  reinstated at any time.
- AutoCoder's loop is clone -> build -> test -> PR. It never touches a running instance, so hosting is
  largely irrelevant to it. What **does** change is the local test command: `wrangler dev` / miniflare
  with a D1 binding instead of `npm start`. **C: this needs a one-off adjustment to your runner.**

## Open questions for this repo's agent

1. **Is auth enforced on `/api/*`, or only in the UI?** (hub Q1, matrix item 29). `middleware/auth.js`
   plus CSRF suggests it is genuinely server-side — please confirm, since SimpleApp is going public.
2. **Any shipped default credentials** in `data/accounts.json` or the README? (hub Q2, matrix 30).
   `admin/admin` on a public URL is worse than no auth, because it looks protected.
3. **Does `public/app.js` use `innerHTML` on user input?** (hub Q3, matrix 19). Stored XSS would
   execute on `praveenyzfr.com`. The one issue Cloudflare's edge cannot mitigate.
4. **Password migration:** rehash existing accounts, or reset them? Only matters if the current
   accounts are worth keeping.
5. **Timing.** Not blocking anything — the VM rollout is gated on other work. Do this when you have
   capacity, not against the rollout.
