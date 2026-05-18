// YL Spark: OpenAI flashcard image generation endpoint
// Required env vars: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const IMAGE_SIZE = process.env.IMAGE_SIZE || "1024x1024";

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
    "Create one square child-friendly ESL flashcard illustration.",
    "Style: simple colourful vector/cartoon, clean white background, rounded friendly shapes.",
    "No text, no letters, no watermark, no logos, no violence, no scary content.",
    `Word/concept: ${clean(card.word, 80)}.`,
    card.sentence ? `Context sentence: ${clean(card.sentence, 150)}.` : "",
    body.topic ? `Topic: ${clean(body.topic, 80)}.` : "",
    body.level ? `CEFR level: ${clean(body.level, 50)}.` : "",
    body.ageGroup ? `Age group: ${clean(body.ageGroup, 50)}.` : "",
    card.imagePrompt ? `Visual idea: ${clean(card.imagePrompt, 180)}.` : "",
    "Make it obvious, printable and suitable for young learners."
  ].filter(Boolean).join(" ");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel." });
  }

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Please sign in before generating images." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  if (!body?.card?.word) return res.status(400).json({ error: "Missing card.word." });

  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildPrompt(body),
        size: IMAGE_SIZE,
        n: 1,
      }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `OpenAI image error (${upstream.status})`,
      });
    }

    const img = data?.data?.[0] || {};
    return res.status(200).json({
      word: body.card.word,
      imageUrl: img.url || "",
      imageBase64: img.b64_json ? `data:image/png;base64,${img.b64_json}` : "",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected image generation error." });
  }
};
