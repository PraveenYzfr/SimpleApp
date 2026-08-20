const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  findByEmail,
  verifyPassword,
  publicAccount,
} = require("../lib/accountsStore");
const {
  requireAuth,
  issueCsrfToken,
  requireCsrf,
  sessionUserPayload,
} = require("../middleware/auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const account = findByEmail(email);
    if (!account || account.disabled) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const ok = await verifyPassword(password, account.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    req.session.accountId = account.id;
    const csrfToken = issueCsrfToken(req);

    res.json({
      account: publicAccount(account),
      csrfToken,
    });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", requireAuth, requireCsrf, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("simpleapp.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = sessionUserPayload(req);
  if (!payload) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Authentication required" });
  }

  res.json(payload);
});

module.exports = router;
