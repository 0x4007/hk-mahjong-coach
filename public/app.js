const state = { mode: "register", session: null };
const authPanel = document.querySelector('[data-panel="auth"]');
const accountPanel = document.querySelector('[data-panel="account"]');
const adminPanel = document.querySelector('[data-panel="admin"]');
const status = document.querySelector("[data-status]");
const authForm = document.querySelector("[data-auth-form]");

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(authForm).entries());
  const path = state.mode === "login" ? "/api/auth/login" : "/api/auth/register";
  const response = await postJson(path, body);
  if (!response.ok) return setStatus(await errorText(response), true);
  await refreshSession();
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  await refreshSession();
});

document.querySelector("[data-agent-token-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const response = await postJson(
    "/api/admin/agent-tokens",
    Object.fromEntries(new FormData(form).entries()),
  );
  if (!response.ok) return setStatus(await errorText(response), true);
  const body = await response.json();
  const output = document.querySelector("[data-agent-token-output]");
  output.hidden = false;
  output.textContent = body.token;
  await loadAdmin();
});

async function refreshSession() {
  state.session = await (await fetch("/api/account/session")).json();
  render();
}

function render() {
  const user = state.session?.user;
  const authenticated = state.session?.authenticated === true;
  authPanel.hidden = authenticated;
  accountPanel.hidden = !authenticated;
  adminPanel.hidden = !authenticated || !["admin", "super_admin"].includes(user?.role);
  document.body.dataset.role = user?.role ?? "guest";
  if (!authenticated) {
    setMode(state.session?.setupRequired ? "register" : state.mode);
    setStatus(state.session?.setupRequired ? "Create the first account." : "");
    return;
  }
  document.querySelector("[data-account-name]").textContent = user.name;
  document.querySelector("[data-account-email]").textContent = user.email;
  document.querySelector("[data-account-role]").textContent = user.role;
  document.querySelector("[data-account-referral]").textContent = user.referralCode;
  setStatus("");
  if (!adminPanel.hidden) loadAdmin();
}

async function loadAdmin() {
  const response = await fetch("/api/admin/users");
  if (!response.ok) return;
  const body = await response.json();
  document.querySelector("[data-users]").innerHTML = body.users.map((user) =>
    `<article><strong>${escapeHtml(user.email)}</strong><span>${escapeHtml(user.name)} · ${
      escapeHtml(user.role)
    }</span></article>`
  ).join("");
}

function setMode(mode) {
  state.mode = mode === "login" ? "login" : "register";
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-current", String(button.dataset.mode === state.mode));
  });
  document.querySelector("[name=name]").closest("label").hidden = state.mode === "login";
  document.querySelector("[data-referral-row]").hidden = state.mode === "login";
}

async function postJson(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function errorText(response) {
  const body = await response.json().catch(() => ({}));
  return body.error || `${response.status}`;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.state = isError ? "error" : "";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;");
}

setMode("register");
refreshSession();
