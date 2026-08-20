const express = require("express");
const {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} = require("../lib/accountsStore");
const {
  requireAuth,
  requireAdmin,
  requireCsrf,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/", (_req, res) => {
  res.json(listAccounts());
});

router.post("/", requireCsrf, async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const account = await createAccount({ name, email, password, role });
    res.status(201).json(account);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Create failed" });
  }
});

router.patch("/:id", requireCsrf, async (req, res) => {
  try {
    const { name, email, password, role, disabled } = req.body || {};
    const account = await updateAccount(req.params.id, {
      name,
      email,
      password,
      role,
      disabled,
    });
    res.json(account);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Update failed" });
  }
});

router.delete("/:id", requireCsrf, async (req, res) => {
  try {
    if (req.account.id === req.params.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const removed = deleteAccount(req.params.id);
    res.json(removed);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Delete failed" });
  }
});

module.exports = router;
