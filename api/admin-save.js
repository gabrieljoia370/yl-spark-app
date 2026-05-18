
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "gabrieljoia370@gmail.com";

async function getUserFromToken(req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  if (!token || !url || !key) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

async function requireAdmin(req, res) {
  const user = await getUserFromToken(req);
  if (!user || String(user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    res.status(403).json({ error: "Admin access only." });
    return null;
  }
  return user;
}

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server env vars.");

  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const settings = body.settings || {};
  const allowed = [
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

  const rows = Object.keys(settings)
    .filter((key) => allowed.includes(key))
    .map((key) => ({ key, value: settings[key], updated_at: new Date().toISOString() }));

  if (!rows.length) return res.status(400).json({ error: "No valid settings to save." });

  try {
    const saveRes = await supabaseFetch("app_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows),
    });

    if (!saveRes.ok) {
      const text = await saveRes.text();
      return res.status(saveRes.status).json({ error: text.slice(0, 500) });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin save error." });
  }
};
