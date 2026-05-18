const FREE_LIMIT = Number(process.env.FREE_GENERATION_LIMIT || 3);

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

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

async function getOrCreateProfile(user) {
  const existing = await supabaseFetch(`profiles?id=eq.${encodeURIComponent(user.id)}&select=*`);
  const rows = await existing.json();
  if (rows && rows[0]) return rows[0];

  const created = await supabaseFetch("profiles", {
    method: "POST",
    body: JSON.stringify({ id: user.id, email: user.email, plan: "free", usage_count: 0 }),
  });
  const createdRows = await created.json();
  return createdRows[0];
}

module.exports = async function handler(req, res) {
  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  const profile = await getOrCreateProfile(user);
  res.status(200).json({
    email: profile.email,
    plan: profile.plan || "free",
    used: Number(profile.usage_count || 0),
    freeLimit: FREE_LIMIT,
  });
};