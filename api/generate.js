// Vercel serverless function: POST /api/generate
// Commercial MVP: requires Supabase Auth, tracks usage, blocks after free limit unless plan is paid.
// Required env vars:
// ANTHROPIC_API_KEY
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// FREE_GENERATION_LIMIT (optional, default 3)
// MERCADOPAGO_PAYMENT_LINK (optional)

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const FREE_LIMIT = Number(process.env.FREE_GENERATION_LIMIT || 3);

const BASE_SYSTEM = `You are YL Spark, a pedagogical assistant for English teachers of young learners (3–12). Your guidance is grounded in:
- Cambridge English Young Learners frameworks (Pre A1 Starters, A1 Movers, A2 Flyers)
- British Council TeachingEnglish principles for young learners
- Colorín Colorado scaffolding strategies for English language learners
- Total Physical Response (TPR) for very young learners (3–6)
- Age-appropriate attention spans: VYL ~5–8 min per activity, YL 7–9 ~8–12 min, YL 10–12 ~12–15 min
- Communicative Language Teaching with chunks of meaningful language

Core principles you always follow:
- Activities are concrete, multi-sensory, and active. Lots of TPR, songs, chants, games, realia.
- Target language is recycled across stages. New vocabulary is presented through context, then practised.
- Instructions to children must be SHORT, with gestures or modelling. Adult-level metalanguage is avoided.
- You include teacher language in simple, kid-friendly English ("Stand up! Touch your nose!").
- You always consider classroom management (transitions, attention signals, energy levels).
- For VYL, sitting still is hard — alternate calm and active stages.
- You suggest no-printer alternatives when possible.
- Because this is for YL/VYL, every lesson plan must include practical visual support: picture prompts, board drawings, flashcards/realia, and image-generation prompts teachers can use in Canva or another tool.

You ALWAYS respond with a single valid JSON object. No prose outside the JSON. No markdown code fences.`;

const PROMPTS = {
  lesson: (i) => `Design a complete English lesson plan.

Context:
- Age group: ${i.ageGroup}
- CEFR level: ${i.level}
- Duration: ${i.duration}
- Class size: ${i.classSize}
- Topic / theme: ${i.topic}
- Target language: ${i.targetLanguage}
- Teacher notes: ${i.notes || "(none)"}

Return ONLY a valid JSON object. Do not include markdown. Do not include explanations outside JSON.
All property names and string values must use double quotes.
Do not use trailing commas.
Do not use ellipses or placeholder values such as "...".

Use this exact structure:
{
  "title": "A clear, kid-friendly lesson title",
  "overallAim": "By the end of the lesson, students will be able to use the target language in a simple classroom task.",
  "targetLanguage": "The vocabulary or structures recycled across the lesson",
  "materials": "Comma-separated list. Mark printables with (printable). Suggest no-print alternatives where possible.",
  "visualSupports": {
    "boardPicture": "Describe one simple board picture or visual scene the teacher can draw or use.",
    "flashcardIdeas": ["Flashcard or image idea 1", "Flashcard or image idea 2", "Flashcard or image idea 3"],
    "imagePrompts": ["Prompt for a child-friendly classroom image or flashcard", "Prompt for another image"],
    "noPrepAlternatives": ["How to teach this visually without printing", "Another no-prep visual option"]
  },
  "stages": [
    {
      "name": "Warmer / Routine",
      "minutes": "5",
      "aim": "Settle learners and activate prior knowledge",
      "steps": ["Step 1 in plain language", "Step 2 in plain language"],
      "teacherLanguage": "Example phrases the teacher will say"
    },
    {
      "name": "Presentation / Lead-in",
      "minutes": "8",
      "aim": "Introduce the target language in context",
      "steps": ["Step 1 in plain language", "Step 2 in plain language"],
      "teacherLanguage": "Example phrases the teacher will say"
    },
    {
      "name": "Controlled practice",
      "minutes": "10",
      "aim": "Help learners practise the target language accurately",
      "steps": ["Step 1 in plain language", "Step 2 in plain language"],
      "teacherLanguage": "Example phrases the teacher will say"
    },
    {
      "name": "Freer practice / Production",
      "minutes": "12",
      "aim": "Help learners use the language more independently",
      "steps": ["Step 1 in plain language", "Step 2 in plain language"],
      "teacherLanguage": "Example phrases the teacher will say"
    },
    {
      "name": "Cooler / Wrap-up",
      "minutes": "5",
      "aim": "Review learning and close the lesson calmly",
      "steps": ["Step 1 in plain language", "Step 2 in plain language"],
      "teacherLanguage": "Example phrases the teacher will say"
    }
  ],
  "differentiation": "How to support stronger and weaker learners in the same class",
  "assessment": "A quick formative check the teacher can use in class",
  "homework": "Optional, short, fun, parent-friendly"
}

Make sure the stages add up roughly to the lesson duration. For VYL, keep individual stages short and active. For all stages, include visual support, movement, modelling, and child-friendly teacher language.`,

  adapter: (i) => `Adapt the following classroom activity for English learners.

Original activity:
"""
${i.activity}
"""

Adapt for:
- Age group: ${i.ageGroup}
- CEFR level: ${i.level}
- Adaptation goal: ${i.goal}

Return JSON with this exact shape:
{
  "title": "Short title for the adapted activity",
  "adapted": "A 2–4 sentence description of the adapted activity, in plain English a teacher can scan quickly.",
  "steps": ["Step 1", "Step 2", "Step 3", "..."],
  "visualSupports": {
    "imagesOrFlashcards": ["Visual idea 1", "Visual idea 2"],
    "noPrepVisuals": ["Gesture/realia/board drawing idea"]
  },
  "scaffolding": ["Specific scaffolding tip 1", "Tip 2", "..."],
  "variations": ["Variation 1 (e.g. for stronger Ss)", "Variation 2 (e.g. quicker version)", "..."],
  "watchOuts": "1–2 sentences on common pitfalls and classroom management."
}`,

  flashcards: (i) => `Build a vocabulary set for English young learners.

Context:
- Topic: ${i.topic}
- Age group: ${i.ageGroup}
- CEFR level: ${i.level}
- Number of items: ${i.count}

Return JSON with this exact shape:
{
  "title": "A clear title for this vocab set",
  "cards": [
    { "word": "the word or short phrase", "partOfSpeech": "noun|verb|adj|phrase", "sentence": "A short, kid-friendly example sentence using the word.", "imagePrompt": "A child-friendly image prompt for this card" }
  ],
  "chant": "A short, rhythmic chant or song hook using several of the words (4–8 lines, fun, repetitive).",
  "games": [
    { "name": "Game name", "howTo": "2-sentence description a teacher can use right away." },
    { "name": "Game name", "howTo": "..." },
    { "name": "Game name", "howTo": "..." }
  ]
}`,
};

function buildPrompt(type, inputs) {
  const builder = PROMPTS[type];
  if (!builder) throw new Error(`Unknown type: ${type}`);
  return builder(inputs);
}

function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty model response.");
  }

  let cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  return JSON.parse(cleaned);
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

async function getUserFromToken(req) {
  const url = process.env.SUPABASE_URL;
  const anonOrService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonOrService, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
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

async function incrementUsage(userId) {
  // Uses RPC if you create it. Falls back to read/update if RPC is not present.
  const rpc = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/increment_usage`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id_input: userId }),
  });
  if (rpc.ok) return;

  const current = await supabaseFetch(`profiles?id=eq.${encodeURIComponent(userId)}&select=usage_count`);
  const rows = await current.json();
  const count = Number(rows?.[0]?.usage_count || 0) + 1;
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ usage_count: count }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Please sign in before generating materials." });

  const profile = await getOrCreateProfile(user);
  const isPaid = profile.plan === "paid";
  const used = Number(profile.usage_count || 0);
  if (!isPaid && used >= FREE_LIMIT) {
    return res.status(402).json({
      error: "Free limit reached. Please upgrade to continue using YL Spark.",
      paymentLink: process.env.MERCADOPAGO_PAYMENT_LINK || "#pricing",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY env var." });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const { type, inputs } = body || {};
  if (!type || !inputs) return res.status(400).json({ error: "Missing 'type' or 'inputs' in request body." });

  let prompt;
  try {
    prompt = buildPrompt(type, inputs);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3500,
        temperature: 0,
        system: BASE_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({
        error: `Anthropic API error: ${upstream.status}`,
        detail: errText.slice(0, 500),
      });
    }

    const data = await upstream.json();
    const text = (data.content || []).map((p) => p.text || "").join("");
    let parsed;
    try {
      parsed = extractJson(text);
    } catch (_) {
      return res.status(502).json({
        error: "Model didn't return valid JSON. Please try again with a shorter topic/notes.",
        raw: text.slice(0, 400)
      });
    }

    await incrementUsage(user.id);
    return res.status(200).json({ result: parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
};
