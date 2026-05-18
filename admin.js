let adminConfig = {};
let adminSupabase = null;
let adminSession = null;

const ids = [
  "heroTitle",
  "heroSubtitle",
  "heroDescription",
  "primaryColor",
  "accentColor",
  "logoSize",
  "freeLimit",
  "price",
  "currency",
  "showPricing",
  "lessonPromptExtra",
  "flashcardsPromptExtra"
];

function $(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  const el = $("admin-status");
  if (el) el.textContent = message || "";
}

function setSaveStatus(message) {
  const el = $("save-status");
  if (el) el.textContent = message || "";
}

async function initAdmin() {
  const configRes = await fetch("/api/config");
  adminConfig = await configRes.json();

  if (!window.supabase || !adminConfig.supabaseUrl || !adminConfig.supabaseAnonKey) {
    setStatus("Supabase is not configured.");
    return;
  }

  adminSupabase = window.supabase.createClient(adminConfig.supabaseUrl, adminConfig.supabaseAnonKey);
  const { data } = await adminSupabase.auth.getSession();
  adminSession = data.session || null;

  adminSupabase.auth.onAuthStateChange(async (_event, session) => {
    adminSession = session;
    await updateAdminUi();
  });

  wireAdminEvents();
  await updateAdminUi();
}

function wireAdminEvents() {
  $("admin-login-btn")?.addEventListener("click", adminEmailLogin);
  $("admin-google-btn")?.addEventListener("click", adminGoogleLogin);
  $("admin-logout-btn")?.addEventListener("click", async () => {
    await adminSupabase.auth.signOut();
  });
  $("save-settings-btn")?.addEventListener("click", saveSettings);
}

async function adminEmailLogin() {
  setStatus("Signing in...");
  const email = $("admin-email").value.trim();
  const password = $("admin-password").value;

  const { error } = await adminSupabase.auth.signInWithPassword({ email, password });
  if (error) setStatus(error.message);
}

async function adminGoogleLogin() {
  setStatus("Opening Google...");
  await adminSupabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${location.origin}/admin.html` },
  });
}

async function updateAdminUi() {
  if (!adminSession) {
    $("admin-login").hidden = false;
    $("admin-panel").hidden = true;
    $("users-panel").hidden = true;
    return;
  }

  $("admin-login").hidden = true;
  $("admin-panel").hidden = false;
  $("users-panel").hidden = false;
  await loadAdminData();
}

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminSession?.access_token || ""}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Admin request failed.");
  return data;
}

async function loadAdminData() {
  try {
    setStatus("");
    const data = await adminFetch("/api/admin-get");
    fillSettings(data.settings || {});
    renderUsers(data.users || []);
  } catch (err) {
    setStatus(err.message);
    $("admin-panel").hidden = true;
    $("users-panel").hidden = true;
    $("admin-login").hidden = false;
  }
}

function fillSettings(settings) {
  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;
    let value = settings[id];

    if (value === undefined || value === null) {
      if (id === "primaryColor") value = "#01696f";
      else if (id === "accentColor") value = "#ef6b53";
      else if (id === "logoSize") value = "medium";
      else if (id === "freeLimit") value = 3;
      else if (id === "price") value = 390;
      else if (id === "currency") value = "UYU";
      else if (id === "showPricing") value = "true";
      else value = "";
    }

    if (typeof value === "boolean") value = String(value);
    el.value = value;
  });
}

function collectSettings() {
  const settings = {};
  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;

    let value = el.value;
    if (id === "freeLimit" || id === "price") value = Number(value || 0);
    if (id === "showPricing") value = value === "true";

    settings[id] = value;
  });
  return settings;
}

async function saveSettings() {
  try {
    setSaveStatus("Saving...");
    await adminFetch("/api/admin-save", {
      method: "POST",
      body: JSON.stringify({ settings: collectSettings() }),
    });
    setSaveStatus("Saved. Refresh the app to see changes.");
  } catch (err) {
    setSaveStatus(err.message);
  }
}

function renderUsers(users) {
  const list = $("users-list");
  if (!list) return;

  if (!users.length) {
    list.innerHTML = "<p>No users yet.</p>";
    return;
  }

  list.innerHTML = users.map((u) => `
    <div class="user-row" data-user-id="${u.id}">
      <strong>${escapeHtml(u.email || "No email")}</strong>
      <select data-field="plan">
        <option value="free" ${u.plan !== "paid" ? "selected" : ""}>free</option>
        <option value="paid" ${u.plan === "paid" ? "selected" : ""}>paid</option>
      </select>
      <input data-field="usage_count" type="number" min="0" value="${Number(u.usage_count || 0)}" />
      <button class="btn ghost small" data-action="reset">Reset usage</button>
      <button class="btn primary small" data-action="save">Save</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".user-row");
      const userId = row.dataset.userId;

      if (btn.dataset.action === "reset") {
        row.querySelector('[data-field="usage_count"]').value = 0;
      }

      const plan = row.querySelector('[data-field="plan"]').value;
      const usage_count = Number(row.querySelector('[data-field="usage_count"]').value || 0);

      btn.textContent = "Saving...";
      try {
        await adminFetch("/api/admin-update-user", {
          method: "POST",
          body: JSON.stringify({ userId, plan, usage_count }),
        });
        btn.textContent = "Saved";
        setTimeout(() => (btn.textContent = btn.dataset.action === "reset" ? "Reset usage" : "Save"), 1000);
      } catch (err) {
        btn.textContent = err.message;
      }
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

initAdmin();
