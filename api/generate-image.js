// Vercel serverless function: POST /api/generate-image
// Generates classroom-safe flashcard images with OpenAI Images.
// Required env vars:
// OPENAI_API_KEY
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// Optional:
// IMAGE_MODEL (default: gpt-image-1)
// IMAGE_SIZE (default: 1024x1024)

const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const IMAGE_SIZE = process.env.IMAGE_SIZE || "1024x1024";

async function getUserFromToken(req) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  if (!token || !url || !key) return null;

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

async function supabaseFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase server env vars are missing.");

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
    body: JSON.stringify({
      id: user.id,
      email: user.email,
      plan: "free",
      usage_count: 0,
    }),
  });

  const createdRows = await created.json();
  return createdRows[0];
}

function safeText(value, max = 260) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s.,;:!?'"()\-_/]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function buildPrompt({ word, sentence, topic, level, ageGroup, imagePrompt }) {
  const safeWord = safeText(word, 80);
  const safeSentence = safeText(sentence, 160);
  const safeTopic = safeText(topic, 80);
  const safeLevel = safeText(level, 60);
  const safeAge = safeText(ageGroup, 60);
  const safeImagePrompt = safeText(imagePrompt, 240);

  return [
    "Create one square, child-friendly ESL flashcard illustration.",
    "Style: simple colourful vector/cartoon illustration, clean white or very light background, rounded shapes, friendly, classroom appropriate, no text, no letters, no watermark, no brand logos, no realistic children, no scary or violent content.",
    safeWord ? `Flashcard word/concept: ${safeWord}.` : "",
    safeSentence ? `Example context: ${safeSentence}.` : "",
    safeTopic ? `Lesson topic: ${safeTopic}.` : "",
    safeLevel ? `English level: ${safeLevel}.` : "",
    safeAge ? `Age group: ${safeAge}.` : "",
    safeImagePrompt ? `Teacher visual idea: ${safeImagePrompt}.` : "",
    "Make the image visually obvious for a young learner and suitable for printing."
  ].filter(Boolean).join(" ");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.status(500).json({ error: "Server is missing OPENAI_API_KEY env var." });
  }

  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ error: "Please sign in before generating flashcard images." });
  }

  const profile = await getOrCreateProfile(user);
  const isPaid = profile.plan === "paid";

  // Images cost more, so free users can preview only a small number per set.
  const maxImages = isPaid ? 12 : 4;

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const cards = Array.isArray(body.cards) ? body.cards : [];
  const topic = body.topic || "";
  const level = body.level || "";
  const ageGroup = body.ageGroup || "";

  if (!cards.length) {
    return res.status(400).json({ error: "Missing cards array." });
  }

  const selectedCards = cards.slice(0, maxImages);

  try {
    const images = [];

    for (const card of selectedCards) {
      const prompt = buildPrompt({
        word: card.word,
        sentence: card.sentence,
        topic,
        level,
        ageGroup,
        imagePrompt: card.imagePrompt,
      });

      const upstream = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt,
          size: IMAGE_SIZE,
          n: 1,
        }),
      });

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok) {
        const message = data?.error?.message || `OpenAI image error (${upstream.status})`;
        return res.status(upstream.status).json({ error: message });
      }

      const imageData = data?.data?.[0] || {};
      const imageUrl = imageData.url || null;
      const imageB64 = imageData.b64_json || null;

      images.push({
        word: card.word || "",
        imageUrl,
        imageBase64: imageB64 ? `data:image/png;base64,${imageB64}` : null,
      });
    }

    return res.status(200).json({
      images,
      limited: cards.length > selectedCards.length,
      maxImages,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected image generation error." });
  }
};
