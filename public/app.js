const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const sessionLabel = document.getElementById("session-label");
const logoutBtn = document.getElementById("logout-btn");

const form = document.getElementById("user-form");
const formSection = document.getElementById("form-section");
const formTitle = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formMessage = document.getElementById("form-message");
const usersBody = document.getElementById("users-body");
const usersActionsCol = document.getElementById("users-actions-col");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");

const accountsSection = document.getElementById("accounts-section");
const accountForm = document.getElementById("account-form");
const accountMessage = document.getElementById("account-message");
const accountsBody = document.getElementById("accounts-body");
const accountSubmitBtn = document.getElementById("account-submit-btn");
const accountCancelBtn = document.getElementById("account-cancel-btn");
const accountsEmpty = document.getElementById("accounts-empty");

const usersPager = {
  pageSize: document.getElementById("users-page-size"),
  prev: document.getElementById("users-prev"),
  next: document.getElementById("users-next"),
  info: document.getElementById("users-page-info"),
};

const accountsPager = {
  pageSize: document.getElementById("accounts-page-size"),
  prev: document.getElementById("accounts-prev"),
  next: document.getElementById("accounts-next"),
  info: document.getElementById("accounts-page-info"),
};

const fields = {
  id: document.getElementById("user-id"),
  name: document.getElementById("name"),
  email: document.getElementById("email"),
  role: document.getElementById("role"),
};

const accountFields = {
  id: document.getElementById("account-id"),
  name: document.getElementById("account-name"),
  email: document.getElementById("account-email"),
  password: document.getElementById("account-password"),
  role: document.getElementById("account-role"),
};

let currentAccount = null;
let csrfToken = null;
let users = [];
let accounts = [];
let editingId = null;
let editingAccountId = null;
let usersPage = 1;
let accountsPage = 1;

function canWriteUsers() {
  return currentAccount && ["editor", "admin"].includes(currentAccount.role);
}

function isAdmin() {
  return currentAccount && currentAccount.role === "admin";
}

async function request(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (csrfToken && options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

function usersApi(path, options = {}) {
  return request(`/api/users${path}`, options);
}

function showLoginMessage(text, type = "error") {
  loginMessage.textContent = text;
  loginMessage.className = `message ${type}`;
}

function showMessage(text, type = "success") {
  formMessage.textContent = text;
  formMessage.className = `message ${type}`;
}

function clearMessage() {
  formMessage.textContent = "";
  formMessage.className = "message";
}

function showAccountMessage(text, type = "success") {
  accountMessage.textContent = text;
  accountMessage.className = `message ${type}`;
}

function textCell(value) {
  const td = document.createElement("td");
  td.textContent = String(value);
  return td;
}

function roleCell(role) {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "role-badge";
  badge.textContent = String(role);
  td.appendChild(badge);
  return td;
}

function actionButton(label, className, attribute, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute(attribute, value);
  return button;
}

function showLogin() {
  currentAccount = null;
  csrfToken = null;
  loginView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showApp() {
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  sessionLabel.textContent = `${currentAccount.name} (${currentAccount.role})`;

  formSection.classList.toggle("hidden", !canWriteUsers());
  usersActionsCol.classList.toggle("hidden", !canWriteUsers());
  accountsSection.classList.toggle("hidden", !isAdmin());
}

function resetForm() {
  editingId = null;
  form.reset();
  fields.id.value = "";
  formTitle.textContent = "Add User";
  submitBtn.textContent = "Add User";
  cancelBtn.classList.add("hidden");
}

function startEdit(user) {
  editingId = user.id;
  fields.id.value = user.id;
  fields.name.value = user.name;
  fields.email.value = user.email;
  fields.role.value = user.role;
  formTitle.textContent = "Edit User";
  submitBtn.textContent = "Save Changes";
  cancelBtn.classList.remove("hidden");
  fields.name.focus();
  clearMessage();
}

function filteredUsers() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
  );
}

/** Clamps a page to the available range and returns the rows for that page. */
function paginate(list, page, pageSizeSelect) {
  const pageSize = Number(pageSizeSelect.value) || 10;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    rows: list.slice(start, start + pageSize),
    currentPage,
    totalPages,
    total: list.length,
    firstRow: list.length === 0 ? 0 : start + 1,
    lastRow: Math.min(start + pageSize, list.length),
  };
}

function updatePagerControls(pager, state) {
  pager.info.textContent = state.total
    ? `${state.firstRow}–${state.lastRow} of ${state.total} · Page ${state.currentPage} of ${state.totalPages}`
    : "No records";
  pager.prev.disabled = state.currentPage <= 1;
  pager.next.disabled = state.currentPage >= state.totalPages;
}

function renderUsers() {
  const list = filteredUsers();
  const state = paginate(list, usersPage, usersPager.pageSize);
  usersPage = state.currentPage;
  usersBody.innerHTML = "";
  updatePagerControls(usersPager, state);

  if (list.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  for (const user of state.rows) {
    const tr = document.createElement("tr");
    tr.append(textCell(user.name), textCell(user.email), roleCell(user.role));

    const actions = document.createElement("td");
    if (canWriteUsers()) {
      actions.className = "actions";
      actions.append(
        actionButton("Edit", "small secondary", "data-edit", user.id),
        actionButton("Delete", "small danger", "data-delete", user.id)
      );
    }
    tr.appendChild(actions);
    usersBody.appendChild(tr);
  }
}

function resetAccountForm() {
  editingAccountId = null;
  accountForm.reset();
  accountFields.id.value = "";
  accountFields.password.required = true;
  accountFields.password.placeholder = "Min 8 characters";
  accountSubmitBtn.textContent = "Add Account";
  accountCancelBtn.classList.add("hidden");
}

function startAccountEdit(account) {
  editingAccountId = account.id;
  accountFields.id.value = account.id;
  accountFields.name.value = account.name;
  accountFields.email.value = account.email;
  accountFields.role.value = account.role;
  accountFields.password.value = "";
  accountFields.password.required = false;
  accountFields.password.placeholder = "Leave blank to keep current password";
  accountSubmitBtn.textContent = "Save Account";
  accountCancelBtn.classList.remove("hidden");
  accountFields.name.focus();
  showAccountMessage("");
}

function renderAccounts() {
  const state = paginate(accounts, accountsPage, accountsPager.pageSize);
  accountsPage = state.currentPage;
  accountsBody.innerHTML = "";
  updatePagerControls(accountsPager, state);
  accountsEmpty.classList.toggle("hidden", accounts.length > 0);

  for (const account of state.rows) {
    const tr = document.createElement("tr");
    const status = account.disabled ? "Disabled" : "Active";
    tr.append(
      textCell(account.name),
      textCell(account.email),
      roleCell(account.role),
      textCell(status)
    );

    const actions = document.createElement("td");
    actions.className = "actions";
    const toggle = actionButton(
      account.disabled ? "Enable" : "Disable",
      "small secondary",
      "data-toggle",
      account.id
    );
    toggle.setAttribute("data-disabled", String(account.disabled));
    actions.append(
      actionButton("Edit", "small secondary", "data-account-edit", account.id),
      toggle,
      actionButton("Delete", "small danger", "data-remove", account.id)
    );
    tr.appendChild(actions);
    accountsBody.appendChild(tr);
  }
}

async function loadUsers() {
  users = await usersApi("");
  renderUsers();
}

async function loadAccounts() {
  if (!isAdmin()) return;
  accounts = await request("/api/accounts");
  renderAccounts();
}

async function bootstrapSession() {
  try {
    const data = await request("/api/auth/me");
    currentAccount = data.account;
    csrfToken = data.csrfToken;
    showApp();
    await loadUsers();
    await loadAccounts();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showLoginMessage("");
  try {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("login-email").value.trim(),
        password: document.getElementById("login-password").value,
      }),
    });
    currentAccount = data.account;
    csrfToken = data.csrfToken;
    loginForm.reset();
    showApp();
    await loadUsers();
    await loadAccounts();
  } catch (err) {
    showLoginMessage(err.message, "error");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    // still clear local session UI
  }
  showLogin();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canWriteUsers()) return;
  clearMessage();

  const payload = {
    name: fields.name.value.trim(),
    email: fields.email.value.trim(),
    role: fields.role.value,
  };

  try {
    if (editingId) {
      await usersApi(`/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showMessage("User updated.");
    } else {
      await usersApi("", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMessage("User created.");
    }
    resetForm();
    await loadUsers();
  } catch (err) {
    showMessage(err.message, "error");
  }
});

cancelBtn.addEventListener("click", () => {
  resetForm();
  clearMessage();
});

searchInput.addEventListener("input", () => {
  usersPage = 1;
  renderUsers();
});

usersPager.pageSize.addEventListener("change", () => {
  usersPage = 1;
  renderUsers();
});

usersPager.prev.addEventListener("click", () => {
  usersPage -= 1;
  renderUsers();
});

usersPager.next.addEventListener("click", () => {
  usersPage += 1;
  renderUsers();
});

accountsPager.pageSize.addEventListener("change", () => {
  accountsPage = 1;
  renderAccounts();
});

accountsPager.prev.addEventListener("click", () => {
  accountsPage -= 1;
  renderAccounts();
});

accountsPager.next.addEventListener("click", () => {
  accountsPage += 1;
  renderAccounts();
});

usersBody.addEventListener("click", async (event) => {
  if (!canWriteUsers()) return;
  const editId = event.target.getAttribute("data-edit");
  const deleteId = event.target.getAttribute("data-delete");

  if (editId) {
    const user = users.find((u) => u.id === editId);
    if (user) startEdit(user);
    return;
  }

  if (deleteId) {
    const user = users.find((u) => u.id === deleteId);
    if (!user) return;
    const ok = window.confirm(`Delete ${user.name}?`);
    if (!ok) return;
    try {
      await usersApi(`/${deleteId}`, { method: "DELETE" });
      if (editingId === deleteId) resetForm();
      showMessage("User deleted.");
      await loadUsers();
    } catch (err) {
      showMessage(err.message, "error");
    }
  }
});

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdmin()) return;
  showAccountMessage("");

  const password = accountFields.password.value;
  const payload = {
    name: accountFields.name.value.trim(),
    email: accountFields.email.value.trim(),
    role: accountFields.role.value,
  };

  try {
    if (editingAccountId) {
      if (password) payload.password = password;
      await request(`/api/accounts/${editingAccountId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      showAccountMessage("Account updated.");
    } else {
      if (!password || password.length < 8) {
        showAccountMessage("Password must be at least 8 characters.", "error");
        return;
      }
      payload.password = password;
      await request("/api/accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showAccountMessage("Account created.");
    }
    resetAccountForm();
    await loadAccounts();
  } catch (err) {
    showAccountMessage(err.message, "error");
  }
});

accountCancelBtn.addEventListener("click", () => {
  resetAccountForm();
  showAccountMessage("");
});

accountsBody.addEventListener("click", async (event) => {
  if (!isAdmin()) return;

  const editId = event.target.getAttribute("data-account-edit");
  const toggleId = event.target.getAttribute("data-toggle");
  const removeId = event.target.getAttribute("data-remove");

  if (editId) {
    const account = accounts.find((a) => a.id === editId);
    if (account) startAccountEdit(account);
    return;
  }

  if (toggleId) {
    const currentlyDisabled = event.target.getAttribute("data-disabled") === "true";
    try {
      await request(`/api/accounts/${toggleId}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: !currentlyDisabled }),
      });
      showAccountMessage(currentlyDisabled ? "Account enabled." : "Account disabled.");
      await loadAccounts();
    } catch (err) {
      showAccountMessage(err.message, "error");
    }
    return;
  }

  if (removeId) {
    const account = accounts.find((a) => a.id === removeId);
    if (!account) return;
    const ok = window.confirm(`Delete login account ${account.email}?`);
    if (!ok) return;
    try {
      await request(`/api/accounts/${removeId}`, { method: "DELETE" });
      if (editingAccountId === removeId) resetAccountForm();
      showAccountMessage("Account deleted.");
      await loadAccounts();
    } catch (err) {
      showAccountMessage(err.message, "error");
    }
  }
});

bootstrapSession();
