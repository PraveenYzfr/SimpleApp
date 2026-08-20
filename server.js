require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const authRouter = require("./routes/auth");
const accountsRouter = require("./routes/accounts");
const { seedAdminFromEnv } = require("./lib/accountsStore");

const app = express();
const PORT = process.env.PORT || 8082;
const SESSION_SECRET = process.env.SESSION_SECRET;
const PUBLIC_DIR = path.join(__dirname, "public");
const LANDING_DIR = path.join(PUBLIC_DIR, "landing");
const DEMO_DIR = path.join(PUBLIC_DIR, "demo");
const SESSION_DIR = path.join(__dirname, "data", "sessions");

if (!SESSION_SECRET) {
  console.error("SESSION_SECRET is required. Set it in the environment or .env file.");
  process.exit(1);
}

app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    name: "simpleapp.sid",
    secret: SESSION_SECRET,
    store: new FileStore({
      path: SESSION_DIR,
      ttl: 8 * 60 * 60,
      reapInterval: 60 * 60,
      retries: 0,
      logFn: (message) => console.error("Session store:", message),
    }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.get("/api/health", (_req, res) => {
  // This reports the landing page only. The demo is deliberately fail-soft.
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/accounts", accountsRouter);

try {
  app.use("/api/users", require("./routes/users"));
} catch (err) {
  console.error("Users demo module failed to load:", err);
  app.use("/api/users", (_req, res) => {
    res.status(503).json({ error: "Demo temporarily unavailable" });
  });
}

app.use("/landing", express.static(LANDING_DIR));

// The demo shell is edited by agents, so never let a browser hold a stale copy.
app.use("/demo", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/demo/styles.css", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "styles.css"));
});
app.get("/demo/app.js", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "app.js"));
});
app.use("/demo", express.static(DEMO_DIR, { etag: false, lastModified: false }));
app.get("/", (_req, res) => {
  res.sendFile(path.join(LANDING_DIR, "index.html"));
});

async function start() {
  const seed = await seedAdminFromEnv();
  if (seed.seeded) {
    console.log(`Seeded admin account: ${seed.email}`);
  } else if (seed.reason === "missing_env") {
    console.warn(
      "No accounts yet. Set AUTH_ADMIN_EMAIL and AUTH_ADMIN_PASSWORD to seed the first admin on startup."
    );
  }

  app.listen(PORT, () => {
    console.log(`Users CRUD app running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
