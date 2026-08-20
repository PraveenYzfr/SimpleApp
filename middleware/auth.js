const crypto = require("crypto");
const { findById, publicAccount } = require("../lib/accountsStore");

function requireAuth(req, res, next) {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const account = findById(req.session.accountId);
  if (!account || account.disabled) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Authentication required" });
  }

  req.account = account;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.account) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.account.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/** Editors and admins can mutate managed users. */
function requireEditor(req, res, next) {
  return requireRole("editor", "admin")(req, res, next);
}

function requireAdmin(req, res, next) {
  return requireRole("admin")(req, res, next);
}

function issueCsrfToken(req) {
  const token = crypto.randomBytes(32).toString("hex");
  req.session.csrfToken = token;
  return token;
}

function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }

  const sessionToken = req.session && req.session.csrfToken;
  const headerToken = req.get("X-CSRF-Token");

  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}

function sessionUserPayload(req) {
  const account = findById(req.session.accountId);
  if (!account || account.disabled) {
    return null;
  }
  return {
    account: publicAccount(account),
    csrfToken: req.session.csrfToken || issueCsrfToken(req),
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireEditor,
  requireAdmin,
  issueCsrfToken,
  requireCsrf,
  sessionUserPayload,
};
