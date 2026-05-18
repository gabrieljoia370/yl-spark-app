const MP_API = "https://api.mercadopago.com/checkout/preferences";

const FREE_LIMIT = Number(process.env.FREE_GENERATION_LIMIT || 3);

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

async function getUserFromToken(req) {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
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
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
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
  const rows = await existing.json().catch(() => []);
  if (rows && rows[0]) return rows[0];

  const created = await supabaseFetch("profiles", {
    method: "POST",
    body: JSON.stringify({ id: user.id, email: user.email, plan: "free", usage_count: 0 }),
  });
  const createdRows = await created.json().catch(() => []);
  return createdRows[0];
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = getEnv("MERCADOPAGO_ACCESS_TOKEN");
  const appUrl = getEnv("APP_URL").replace(/\/$/, "");
  const price = Number(getEnv("MERCADOPAGO_PRICE", "390"));
  const currency = getEnv("MERCADOPAGO_CURRENCY", "UYU");

  if (!accessToken) return res.status(500).json({ error: "Missing MERCADOPAGO_ACCESS_TOKEN in Vercel." });
  if (!appUrl) return res.status(500).json({ error: "Missing APP_URL in Vercel." });

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Please sign in first." });

  const profile = await getOrCreateProfile(user);
  if (profile?.plan === "paid") {
    return res.status(200).json({ alreadyPaid: true, message: "Your Teacher Plan is already active." });
  }

  const preference = {
    items: [
      {
        title: "YL Spark Teacher Plan",
        description: `Unlimited YL Spark generations. Free limit: ${FREE_LIMIT}.`,
        quantity: 1,
        currency_id: currency,
        unit_price: price,
      },
    ],
    payer: { email: user.email },
    external_reference: user.id,
    metadata: {
      user_id: user.id,
      user_email: user.email,
      product: "yl_spark_teacher_plan",
    },
    back_urls: {
      success: `${appUrl}/?payment=success`,
      failure: `${appUrl}/?payment=failure`,
      pending: `${appUrl}/?payment=pending`,
    },
    auto_return: "approved",
    notification_url: `${appUrl}/api/mercadopago-webhook`,
    statement_descriptor: "YL SPARK",
  };

  const mpRes = await fetch(MP_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preference),
  });

  const data = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok) {
    return res.status(mpRes.status).json({
      error: "Mercado Pago checkout could not be created.",
      detail: data,
    });
  }

  return res.status(200).json({
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  });
};
