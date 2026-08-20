const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

const DATA_FILE = path.join(__dirname, "..", "data", "accounts.json");
const ROLES = ["viewer", "editor", "admin"];
const SALT_ROUNDS = 10;

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]\n", "utf8");
  }
}

function readAccounts() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeAccounts(accounts) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 2), "utf8");
}

function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    disabled: Boolean(account.disabled),
    createdAt: account.createdAt,
  };
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidRole(role) {
  return ROLES.includes(role);
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

async function seedAdminFromEnv() {
  ensureFile();
  const accounts = readAccounts();
  if (accounts.length > 0) {
    return { seeded: false, reason: "accounts_exist" };
  }

  const email = process.env.AUTH_ADMIN_EMAIL;
  const password = process.env.AUTH_ADMIN_PASSWORD;
  const name = process.env.AUTH_ADMIN_NAME || "Admin";

  if (!email || !password) {
    return { seeded: false, reason: "missing_env" };
  }

  if (!isValidEmail(email)) {
    throw new Error("AUTH_ADMIN_EMAIL is not a valid email");
  }
  if (password.length < 8) {
    throw new Error("AUTH_ADMIN_PASSWORD must be at least 8 characters");
  }

  const admin = {
    id: uuidv4(),
    email: email.trim().toLowerCase(),
    name: name.trim(),
    passwordHash: await hashPassword(password),
    role: "admin",
    disabled: false,
    createdAt: new Date().toISOString(),
  };

  writeAccounts([admin]);
  return { seeded: true, email: admin.email };
}

async function createAccount({ email, password, name, role }) {
  if (!email || !password || !name || !role) {
    const err = new Error("Name, email, password, and role are required");
    err.status = 400;
    throw err;
  }
  if (!isValidEmail(email)) {
    const err = new Error("Invalid email format");
    err.status = 400;
    throw err;
  }
  if (!isValidRole(role)) {
    const err = new Error("Role must be viewer, editor, or admin");
    err.status = 400;
    throw err;
  }
  if (password.length < 8) {
    const err = new Error("Password must be at least 8 characters");
    err.status = 400;
    throw err;
  }

  const accounts = readAccounts();
  const normalized = email.trim().toLowerCase();
  if (accounts.some((a) => a.email === normalized)) {
    const err = new Error("Email already exists");
    err.status = 409;
    throw err;
  }

  const account = {
    id: uuidv4(),
    email: normalized,
    name: name.trim(),
    passwordHash: await hashPassword(password),
    role,
    disabled: false,
    createdAt: new Date().toISOString(),
  };

  accounts.push(account);
  writeAccounts(accounts);
  return publicAccount(account);
}

function findByEmail(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  return readAccounts().find((a) => a.email === normalized) || null;
}

function findById(id) {
  return readAccounts().find((a) => a.id === id) || null;
}

function listAccounts() {
  return readAccounts().map(publicAccount);
}

async function updateAccount(id, updates) {
  const accounts = readAccounts();
  const index = accounts.findIndex((a) => a.id === id);
  if (index === -1) {
    const err = new Error("Account not found");
    err.status = 404;
    throw err;
  }

  if (updates.email !== undefined) {
    if (!isValidEmail(updates.email)) {
      const err = new Error("Invalid email format");
      err.status = 400;
      throw err;
    }
    const normalized = updates.email.trim().toLowerCase();
    const conflict = accounts.some((a) => a.id !== id && a.email === normalized);
    if (conflict) {
      const err = new Error("Email already exists");
      err.status = 409;
      throw err;
    }
    accounts[index].email = normalized;
  }

  if (updates.name !== undefined) {
    if (!String(updates.name).trim()) {
      const err = new Error("Name cannot be empty");
      err.status = 400;
      throw err;
    }
    accounts[index].name = String(updates.name).trim();
  }

  if (updates.role !== undefined) {
    if (!isValidRole(updates.role)) {
      const err = new Error("Role must be viewer, editor, or admin");
      err.status = 400;
      throw err;
    }
    if (
      updates.role !== "admin" &&
      accounts[index].role === "admin" &&
      !accounts[index].disabled
    ) {
      const otherActiveAdmins = accounts.filter(
        (a) => a.id !== id && a.role === "admin" && !a.disabled
      );
      if (otherActiveAdmins.length < 1) {
        const err = new Error("Cannot demote the last admin account");
        err.status = 400;
        throw err;
      }
    }
    accounts[index].role = updates.role;
  }

  if (updates.disabled !== undefined) {
    const nextDisabled = Boolean(updates.disabled);
    if (nextDisabled && accounts[index].role === "admin" && !accounts[index].disabled) {
      const otherActiveAdmins = accounts.filter(
        (a) => a.id !== id && a.role === "admin" && !a.disabled
      );
      if (otherActiveAdmins.length < 1) {
        const err = new Error("Cannot disable the last admin account");
        err.status = 400;
        throw err;
      }
    }
    accounts[index].disabled = nextDisabled;
  }

  if (updates.password !== undefined) {
    if (String(updates.password).length < 8) {
      const err = new Error("Password must be at least 8 characters");
      err.status = 400;
      throw err;
    }
    accounts[index].passwordHash = await hashPassword(updates.password);
  }

  writeAccounts(accounts);
  return publicAccount(accounts[index]);
}

function deleteAccount(id) {
  const accounts = readAccounts();
  const index = accounts.findIndex((a) => a.id === id);
  if (index === -1) {
    const err = new Error("Account not found");
    err.status = 404;
    throw err;
  }

  const activeAdmins = accounts.filter((a) => a.role === "admin" && !a.disabled);
  if (accounts[index].role === "admin" && activeAdmins.length <= 1) {
    const err = new Error("Cannot delete the last admin account");
    err.status = 400;
    throw err;
  }

  const [removed] = accounts.splice(index, 1);
  writeAccounts(accounts);
  return publicAccount(removed);
}

module.exports = {
  ROLES,
  readAccounts,
  writeAccounts,
  publicAccount,
  seedAdminFromEnv,
  createAccount,
  findByEmail,
  findById,
  listAccounts,
  updateAccount,
  deleteAccount,
  verifyPassword,
  isValidEmail,
  isValidRole,
};
