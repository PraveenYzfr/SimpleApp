const express = require("express");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const {
  requireAuth,
  requireEditor,
  requireCsrf,
} = require("../middleware/auth");

const router = express.Router();
const DATA_FILE = path.join(__dirname, "..", "data", "users.json");

function readUsers() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.use(requireAuth);

// GET /api/users — list all users (any authenticated role)
router.get("/", (req, res) => {
  const users = readUsers();
  res.json(users);
});

// GET /api/users/:id — get one user
router.get("/:id", (req, res) => {
  const users = readUsers();
  const user = users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(user);
});

// POST /api/users — create user (editor/admin)
router.post("/", requireEditor, requireCsrf, (req, res) => {
  const { name, email, role } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const users = readUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const user = {
    id: uuidv4(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role || "user",
  };

  users.push(user);
  writeUsers(users);
  res.status(201).json(user);
});

// PUT /api/users/:id — update user (editor/admin)
router.put("/:id", requireEditor, requireCsrf, (req, res) => {
  const { name, email, role } = req.body;
  const users = readUsers();
  const index = users.findIndex((u) => u.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (email) {
    const conflict = users.some(
      (u) => u.id !== req.params.id && u.email.toLowerCase() === email.toLowerCase()
    );
    if (conflict) {
      return res.status(409).json({ error: "Email already exists" });
    }
  }

  users[index] = {
    ...users[index],
    name: name !== undefined ? name.trim() : users[index].name,
    email: email !== undefined ? email.trim().toLowerCase() : users[index].email,
    role: role !== undefined ? role : users[index].role,
  };

  writeUsers(users);
  res.json(users[index]);
});

// DELETE /api/users/:id — delete user (editor/admin)
router.delete("/:id", requireEditor, requireCsrf, (req, res) => {
  const users = readUsers();
  const index = users.findIndex((u) => u.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const [removed] = users.splice(index, 1);
  writeUsers(users);
  res.json(removed);
});

module.exports = router;
