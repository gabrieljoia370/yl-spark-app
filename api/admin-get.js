
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
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const settingsRes = await supabaseFetch("app_settings?select=key,value&order=key.asc");
    const settingsRows = await settingsRes.json();

    const settings = {};
    (settingsRows || []).forEach((row) => {
      settings[row.key] = row.value;
    });

    const usersRes = await supabaseFetch("profiles?select=id,email,plan,usage_count,created_at&order=created_at.desc&limit=100");
    const users = await usersRes.json();

    res.status(200).json({ settings, users });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin load error." });
  }
};
