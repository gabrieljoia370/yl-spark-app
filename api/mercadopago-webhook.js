function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
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

function extractPaymentId(req) {
  const q = req.query || {};
  if (q["data.id"]) return q["data.id"];
  if (q.id && (q.topic === "payment" || q.type === "payment")) return q.id;
  if (req.body?.data?.id) return req.body.data.id;
  if (req.body?.id && (req.body?.type === "payment" || req.body?.topic === "payment")) return req.body.id;
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = getEnv("MERCADOPAGO_ACCESS_TOKEN");
  if (!accessToken) return res.status(200).json({ ok: true, skipped: "missing access token" });

  const paymentId = extractPaymentId(req);
  if (!paymentId) return res.status(200).json({ ok: true, skipped: "not a payment notification" });

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payment = await paymentRes.json().catch(() => ({}));
  if (!paymentRes.ok) {
    return res.status(200).json({ ok: true, skipped: "could not fetch payment" });
  }

  const userId = payment.external_reference || payment.metadata?.user_id;
  const status = payment.status;

  if (status === "approved" && userId) {
    await supabaseFetch(`profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ plan: "paid", updated_at: new Date().toISOString() }),
    });
  }

  return res.status(200).json({ ok: true });
};
