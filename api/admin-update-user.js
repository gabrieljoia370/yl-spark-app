
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

  const { userId, plan, usage_count } = body;
  if (!userId) return res.status(400).json({ error: "Missing userId." });

  const patch = {};
  if (plan === "free" || plan === "paid") patch.plan = plan;
  if (usage_count !== undefined && !Number.isNaN(Number(usage_count))) patch.usage_count = Number(usage_count);

  if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to update." });

  try {
    const updateRes = await supabaseFetch(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return res.status(updateRes.status).json({ error: text.slice(0, 500) });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin user update error." });
  }
};
