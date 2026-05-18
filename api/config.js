module.exports = async function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    freeLimit: Number(process.env.FREE_GENERATION_LIMIT || 3),
    paymentLink: process.env.MERCADOPAGO_PAYMENT_LINK || "#pricing",
  });
};