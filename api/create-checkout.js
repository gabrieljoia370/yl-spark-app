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

async function getAppSettings() {
  try {
    const res = await supabaseFetch("app_settings?select=key,value");
    if (!res.ok) return {};
    const rows = await res.json();
    const settings = {};
    (rows || []).forEach((row) => { settings[row.key] = row.value; });
    return settings;
  } catch (_) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: "Missing MERCADOPAGO_ACCESS_TOKEN in Vercel." });

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Please sign in before upgrading." });

  const profile = await getOrCreateProfile(user);
  if (profile.plan === "paid") {
    return res.status(200).json({ alreadyPaid: true, message: "Your plan is already active." });
  }

  const settings = await getAppSettings();
  const price = Number(settings.price ?? process.env.MERCADOPAGO_PRICE ?? 390);
  const currency = String(settings.currency || process.env.MERCADOPAGO_CURRENCY || "UYU");
  const appUrl = String(process.env.APP_URL || "https://ylspark.app").replace(/\/$/, "");

  if (!price || price <= 0) return res.status(400).json({ error: "Invalid price. Check admin price setting." });

  const preference = {
    items: [{
      title: "YL Spark Teacher Plan",
      description: "Premium access to YL Spark materials and AI tools",
      quantity: 1,
      currency_id: currency,
      unit_price: price,
    }],
    payer: { email: user.email },
    external_reference: user.id,
    metadata: { user_id: user.id, email: user.email, product: "yl_spark_teacher_plan", price, currency },
    back_urls: {
      success: `${appUrl}/?payment=success`,
      pending: `${appUrl}/?payment=pending`,
      failure: `${appUrl}/?payment=failure`,
    },
    auto_return: "approved",
    notification_url: `${appUrl}/api/mercadopago-webhook`,
  };

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(preference),
    });
    const data = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) return res.status(mpRes.status).json({ error: data?.message || data?.error || "Mercado Pago checkout error.", detail: data });
    res.status(200).json({ id: data.id, init_point: data.init_point, sandbox_init_point: data.sandbox_init_point, price, currency });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not create Mercado Pago checkout." });
  }
};
