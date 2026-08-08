const form = document.getElementById("user-form");
const formTitle = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formMessage = document.getElementById("form-message");
const usersBody = document.getElementById("users-body");
const emptyState = document.getElementById("empty-state");
const searchInput = document.getElementById("search");

const fields = {
  id: document.getElementById("user-id"),
  name: document.getElementById("name"),
  email: document.getElementById("email"),
  role: document.getElementById("role"),
};

let users = [];
let editingId = null;

async function api(path, options = {}) {
  const res = await fetch(`/api/users${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function showMessage(text, type = "success") {
  formMessage.textContent = text;
  formMessage.className = `message ${type}`;
}

function clearMessage() {
  formMessage.textContent = "";
  formMessage.className = "message";
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

function renderUsers() {
  const list = filteredUsers();
  usersBody.innerHTML = "";

  if (list.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  for (const user of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="role-badge">${escapeHtml(user.role)}</span></td>
      <td class="actions">
        <button type="button" class="small secondary" data-edit="${user.id}">Edit</button>
        <button type="button" class="small danger" data-delete="${user.id}">Delete</button>
      </td>
    `;
    usersBody.appendChild(tr);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadUsers() {
  users = await api("");
  renderUsers();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const payload = {
    name: fields.name.value.trim(),
    email: fields.email.value.trim(),
    role: fields.role.value,
  };

  try {
    if (editingId) {
      await api(`/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showMessage("User updated.");
    } else {
      await api("", {
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

searchInput.addEventListener("input", renderUsers);

usersBody.addEventListener("click", async (event) => {
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
      await api(`/${deleteId}`, { method: "DELETE" });
      if (editingId === deleteId) resetForm();
      showMessage("User deleted.");
      await loadUsers();
    } catch (err) {
      showMessage(err.message, "error");
    }
  }
});

loadUsers().catch((err) => showMessage(err.message, "error"));
