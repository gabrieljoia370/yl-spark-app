// YL Spark: Stability AI flashcard image generation endpoint
// Required env vars: STABILITY_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional env vars: IMAGE_PROVIDER=stability, STABILITY_OUTPUT_FORMAT=png

const STABILITY_URL = "https://api.stability.ai/v2beta/stable-image/generate/core";
const OUTPUT_FORMAT = process.env.STABILITY_OUTPUT_FORMAT || "png";

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

function clean(value, max = 220) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s.,;:!?'"()\-_/]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildPrompt(body) {
  const card = body.card || {};
  return [
    "Square ESL flashcard illustration for children.",
    "Simple colourful vector/cartoon style, clean white background, rounded friendly shapes.",
    "No text, no letters, no watermark, no logos, no scary content, no violence.",
    `Word or concept: ${clean(card.word, 80)}.`,
    card.sentence ? `Context: ${clean(card.sentence, 150)}.` : "",
    body.topic ? `Topic: ${clean(body.topic, 80)}.` : "",
    body.level ? `CEFR level: ${clean(body.level, 50)}.` : "",
    body.ageGroup ? `Age group: ${clean(body.ageGroup, 50)}.` : "",
    card.imagePrompt ? `Visual idea: ${clean(card.imagePrompt, 180)}.` : "",
    "Make it obvious, printable and suitable for young learners."
  ].filter(Boolean).join(" ");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.STABILITY_API_KEY) {
    return res.status(500).json({ error: "Missing STABILITY_API_KEY in Vercel." });
  }

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Please sign in before generating images." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  if (!body?.card?.word) return res.status(400).json({ error: "Missing card.word." });

  try {
    const form = new FormData();
    form.append("prompt", buildPrompt(body));
    form.append("output_format", OUTPUT_FORMAT);
    form.append("aspect_ratio", "1:1");

    const upstream = await fetch(STABILITY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: "image/*",
      },
      body: form,
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return res.status(upstream.status).json({
        error: `Stability image error (${upstream.status}): ${errText.slice(0, 300)}`,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return res.status(200).json({
      word: body.card.word,
      imageUrl: "",
      imageBase64: `data:image/${OUTPUT_FORMAT};base64,${base64}`,
      provider: "stability",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected Stability image error." });
  }
};
