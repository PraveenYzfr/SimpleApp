import { Hono } from "hono";
import { hashPassword, verifyPassword } from "./password.js";
import {
  createSessionCookie,
  clearSessionCookie,
  readSession,
  getCsrfHeader,
  publicAccount,
} from "./session.js";

const ROLES = ["viewer", "editor", "admin"];

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cookieSecure(env) {
  return String(env.COOKIE_SECURE ?? "true") !== "false";
}

async function seedAdminIfNeeded(env) {
  const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM accounts").first();
  if (count && Number(count.c) > 0) return;

  const email = env.AUTH_ADMIN_EMAIL;
  const password = env.AUTH_ADMIN_PASSWORD;
  const name = env.AUTH_ADMIN_NAME || "Admin";
  if (!email || !password || password.length < 8 || !isValidEmail(email)) return;

  await env.DB.prepare(
    `INSERT INTO accounts (id, email, name, password_hash, role, disabled, created_at)
     VALUES (?, ?, ?, ?, 'admin', 0, datetime('now'))`
  )
    .bind(crypto.randomUUID(), email.trim().toLowerCase(), name.trim(), await hashPassword(password))
    .run();
}

function requireAuth() {
  return async (c, next) => {
    const session = c.get("session");
    if (!session?.accountId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const row = await c.env.DB.prepare(
      "SELECT id, email, name, role, disabled, created_at FROM accounts WHERE id = ?"
    )
      .bind(session.accountId)
      .first();
    if (!row || row.disabled) {
      return c.json({ error: "Authentication required" }, 401);
    }
    c.set("account", row);
    await next();
  };
}

function requireRole(...roles) {
  return async (c, next) => {
    const account = c.get("account");
    if (!account) return c.json({ error: "Authentication required" }, 401);
    if (!roles.includes(account.role)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    await next();
  };
}

function requireCsrf() {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      await next();
      return;
    }
    const session = c.get("session");
    const header = getCsrfHeader(c.req.raw);
    if (!session?.csrf || !header || session.csrf !== header) {
      return c.json({ error: "Invalid CSRF token" }, 403);
    }
    await next();
  };
}

export function createApp() {
  const app = new Hono();

  // Health is public and never requires secrets (helps diagnose misconfigured deploys).
  app.get("/api/health", (c) => {
    const missing = [];
    if (!c.env.SESSION_SECRET) missing.push("SESSION_SECRET");
    if (!c.env.AUTH_ADMIN_EMAIL) missing.push("AUTH_ADMIN_EMAIL");
    if (!c.env.AUTH_ADMIN_PASSWORD) missing.push("AUTH_ADMIN_PASSWORD");
    if (!c.env.DB) missing.push("DB");
    if (missing.length) {
      return c.json(
        {
          status: "misconfigured",
          error: "Missing Worker secrets/bindings",
          missing,
          hint: "Set encrypted Secrets in the Worker (not Build vars). Use Type=Secret, then click Deploy. Or: npx wrangler secret put SESSION_SECRET",
        },
        503
      );
    }
    return c.json({ status: "ok" });
  });

  app.use("/api/*", async (c, next) => {
    if (c.req.path === "/api/health") {
      await next();
      return;
    }
    if (!c.env.SESSION_SECRET) {
      return c.json(
        {
          error: "SESSION_SECRET is not configured",
          hint: "Add SESSION_SECRET as a Secret (encrypted), then click Deploy on Variables and Secrets.",
        },
        500
      );
    }
    await seedAdminIfNeeded(c.env);
    const session = await readSession(c.req.raw, c.env.SESSION_SECRET);
    c.set("session", session);
    await next();
  });

  // ---- auth ----
  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { email, password } = body;
    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }
    const row = await c.env.DB.prepare(
      "SELECT * FROM accounts WHERE email = ?"
    )
      .bind(String(email).trim().toLowerCase())
      .first();
    if (!row || row.disabled) {
      return c.json({ error: "Invalid email or password" }, 401);
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return c.json({ error: "Invalid email or password" }, 401);

    const { cookie, csrf } = await createSessionCookie(row, c.env.SESSION_SECRET, {
      secure: cookieSecure(c.env),
    });
    c.header("Set-Cookie", cookie);
    return c.json({ account: publicAccount(row), csrfToken: csrf });
  });

  app.post("/api/auth/logout", requireAuth(), requireCsrf(), async (c) => {
    c.header("Set-Cookie", clearSessionCookie({ secure: cookieSecure(c.env) }));
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", async (c) => {
    const session = c.get("session");
    if (!session?.accountId) {
      return c.json({ error: "Authentication required" }, 401);
    }
    const row = await c.env.DB.prepare(
      "SELECT id, email, name, role, disabled, created_at FROM accounts WHERE id = ?"
    )
      .bind(session.accountId)
      .first();
    if (!row || row.disabled) {
      return c.json({ error: "Authentication required" }, 401);
    }
    return c.json({ account: publicAccount(row), csrfToken: session.csrf });
  });

  // ---- users ----
  const users = new Hono();
  users.use("*", requireAuth());

  users.get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, name, email, role FROM users ORDER BY name"
    ).all();
    return c.json(results || []);
  });

  users.get("/:id", async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT id, name, email, role FROM users WHERE id = ?"
    )
      .bind(c.req.param("id"))
      .first();
    if (!row) return c.json({ error: "User not found" }, 404);
    return c.json(row);
  });

  users.post("/", requireRole("editor", "admin"), requireCsrf(), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, email, role } = body;
    if (!name || !email) return c.json({ error: "Name and email are required" }, 400);
    if (!isValidEmail(email)) return c.json({ error: "Invalid email format" }, 400);

    const existing = await c.env.DB.prepare(
      "SELECT id FROM users WHERE lower(email) = lower(?)"
    )
      .bind(email.trim())
      .first();
    if (existing) return c.json({ error: "Email already exists" }, 409);

    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || "user",
    };
    await c.env.DB.prepare(
      `INSERT INTO users (id, name, email, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(user.id, user.name, user.email, user.role)
      .run();
    return c.json(user, 201);
  });

  users.put("/:id", requireRole("editor", "admin"), requireCsrf(), async (c) => {
    const id = c.req.param("id");
    const current = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(id)
      .first();
    if (!current) return c.json({ error: "User not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const name = body.name !== undefined ? String(body.name).trim() : current.name;
    const email =
      body.email !== undefined ? String(body.email).trim().toLowerCase() : current.email;
    const role = body.role !== undefined ? body.role : current.role;

    if (body.email !== undefined && !isValidEmail(email)) {
      return c.json({ error: "Invalid email format" }, 400);
    }
    if (body.email !== undefined) {
      const conflict = await c.env.DB.prepare(
        "SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?"
      )
        .bind(email, id)
        .first();
      if (conflict) return c.json({ error: "Email already exists" }, 409);
    }

    await c.env.DB.prepare(
      `UPDATE users SET name = ?, email = ?, role = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(name, email, role, id)
      .run();
    return c.json({ id, name, email, role });
  });

  users.delete("/:id", requireRole("editor", "admin"), requireCsrf(), async (c) => {
    const id = c.req.param("id");
    const current = await c.env.DB.prepare(
      "SELECT id, name, email, role FROM users WHERE id = ?"
    )
      .bind(id)
      .first();
    if (!current) return c.json({ error: "User not found" }, 404);
    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return c.json(current);
  });

  app.route("/api/users", users);

  // ---- accounts (admin) ----
  const accounts = new Hono();
  accounts.use("*", requireAuth(), requireRole("admin"));

  accounts.get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, email, name, role, disabled, created_at FROM accounts ORDER BY email"
    ).all();
    return c.json((results || []).map(publicAccount));
  });

  accounts.post("/", requireCsrf(), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, email, password, role } = body;
    if (!name || !email || !password || !role) {
      return c.json({ error: "Name, email, password, and role are required" }, 400);
    }
    if (!isValidEmail(email)) return c.json({ error: "Invalid email format" }, 400);
    if (!ROLES.includes(role)) {
      return c.json({ error: "Role must be viewer, editor, or admin" }, 400);
    }
    if (String(password).length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }
    const normalized = email.trim().toLowerCase();
    const conflict = await c.env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
      .bind(normalized)
      .first();
    if (conflict) return c.json({ error: "Email already exists" }, 409);

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO accounts (id, email, name, password_hash, role, disabled, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
      .bind(id, normalized, name.trim(), await hashPassword(password), role, createdAt)
      .run();
    return c.json(
      publicAccount({
        id,
        email: normalized,
        name: name.trim(),
        role,
        disabled: 0,
        created_at: createdAt,
      }),
      201
    );
  });

  accounts.patch("/:id", requireCsrf(), async (c) => {
    const id = c.req.param("id");
    const current = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
      .bind(id)
      .first();
    if (!current) return c.json({ error: "Account not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    let { name, email, password, role, disabled } = body;

    if (role !== undefined) {
      if (!ROLES.includes(role)) {
        return c.json({ error: "Role must be viewer, editor, or admin" }, 400);
      }
      if (role !== "admin" && current.role === "admin" && !current.disabled) {
        const others = await c.env.DB.prepare(
          "SELECT COUNT(*) AS c FROM accounts WHERE role = 'admin' AND disabled = 0 AND id != ?"
        )
          .bind(id)
          .first();
        if (Number(others.c) < 1) {
          return c.json({ error: "Cannot demote the last admin account" }, 400);
        }
      }
    }

    if (disabled !== undefined) {
      const nextDisabled = disabled ? 1 : 0;
      if (nextDisabled && current.role === "admin" && !current.disabled) {
        const others = await c.env.DB.prepare(
          "SELECT COUNT(*) AS c FROM accounts WHERE role = 'admin' AND disabled = 0 AND id != ?"
        )
          .bind(id)
          .first();
        if (Number(others.c) < 1) {
          return c.json({ error: "Cannot disable the last admin account" }, 400);
        }
      }
      disabled = nextDisabled;
    }

    if (email !== undefined) {
      if (!isValidEmail(email)) return c.json({ error: "Invalid email format" }, 400);
      email = email.trim().toLowerCase();
      const conflict = await c.env.DB.prepare(
        "SELECT id FROM accounts WHERE email = ? AND id != ?"
      )
        .bind(email, id)
        .first();
      if (conflict) return c.json({ error: "Email already exists" }, 409);
    }

    if (name !== undefined && !String(name).trim()) {
      return c.json({ error: "Name cannot be empty" }, 400);
    }
    if (password !== undefined && String(password).length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const next = {
      name: name !== undefined ? String(name).trim() : current.name,
      email: email !== undefined ? email : current.email,
      role: role !== undefined ? role : current.role,
      disabled: disabled !== undefined ? disabled : current.disabled,
      password_hash: current.password_hash,
    };
    if (password !== undefined) {
      next.password_hash = await hashPassword(password);
    }

    await c.env.DB.prepare(
      `UPDATE accounts SET name = ?, email = ?, role = ?, disabled = ?, password_hash = ? WHERE id = ?`
    )
      .bind(next.name, next.email, next.role, next.disabled, next.password_hash, id)
      .run();

    return c.json(
      publicAccount({
        id,
        name: next.name,
        email: next.email,
        role: next.role,
        disabled: next.disabled,
        created_at: current.created_at,
      })
    );
  });

  accounts.delete("/:id", requireCsrf(), async (c) => {
    const id = c.req.param("id");
    const me = c.get("account");
    if (me.id === id) {
      return c.json({ error: "Cannot delete your own account" }, 400);
    }
    const current = await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
      .bind(id)
      .first();
    if (!current) return c.json({ error: "Account not found" }, 404);
    if (current.role === "admin" && !current.disabled) {
      const others = await c.env.DB.prepare(
        "SELECT COUNT(*) AS c FROM accounts WHERE role = 'admin' AND disabled = 0 AND id != ?"
      )
        .bind(id)
        .first();
      if (Number(others.c) < 1) {
        return c.json({ error: "Cannot delete the last admin account" }, 400);
      }
    }
    await c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id).run();
    return c.json(publicAccount(current));
  });

  app.route("/api/accounts", accounts);

  return app;
}
