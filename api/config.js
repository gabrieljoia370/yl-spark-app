async function getAppSettings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return {};

  try {
    const res = await fetch(`${url}/rest/v1/app_settings?select=key,value`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) return {};
    const rows = await res.json();
    const settings = {};
    (rows || []).forEach((row) => {
      settings[row.key] = row.value;
    });
    return settings;
  } catch (_) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  const settings = await getAppSettings();

  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    freeLimit: Number(settings.freeLimit || process.env.FREE_GENERATION_LIMIT || 3),
    paymentLink: "#pricing",
    price: Number(settings.price || process.env.MERCADOPAGO_PRICE || 390),
    currency: settings.currency || process.env.MERCADOPAGO_CURRENCY || "UYU",
    appSettings: settings,
  });
};
