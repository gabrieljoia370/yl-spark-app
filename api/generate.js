// Vercel serverless function: POST /api/generate
// Proxies requests to Anthropic's Claude API.
// Required env var: ANTHROPIC_API_KEY

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

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

Return JSON with this exact shape:
{
  "title": "A clear, kid-friendly lesson title",
  "overallAim": "By the end of the lesson, students will be able to ...",
  "targetLanguage": "The vocabulary/structures recycled across the lesson",
  "materials": "Comma-separated list. Mark printables with (printable). Suggest no-print alternatives where possible.",
  "stages": [
    {
      "name": "Warmer / Routine",
      "minutes": "5",
      "aim": "Settle and activate prior knowledge",
      "steps": ["Step 1 in plain language", "Step 2", "..."],
      "teacherLanguage": "Example phrases the teacher will say"
    },
    { "name": "Presentation / Lead-in", "minutes": "...", "aim": "...", "steps": [...], "teacherLanguage": "..." },
    { "name": "Controlled practice", "minutes": "...", "aim": "...", "steps": [...], "teacherLanguage": "..." },
    { "name": "Freer practice / Production", "minutes": "...", "aim": "...", "steps": [...], "teacherLanguage": "..." },
    { "name": "Cooler / Wrap-up", "minutes": "...", "aim": "...", "steps": [...], "teacherLanguage": "..." }
  ],
  "differentiation": "How to support stronger and weaker learners in the same class",
  "assessment": "A quick formative check the teacher can use in class",
  "homework": "Optional, short, fun, parent-friendly"
}

Make sure stage minutes add up roughly to the lesson duration. For VYL, keep individual stages short (5–8 min). For older YL, stages can be longer.`,

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
  "scaffolding": ["Specific scaffolding tip 1", "Tip 2", "..."],
  "variations": ["Variation 1 (e.g. for stronger Ss)", "Variation 2 (e.g. quicker version)", "..."],
  "watchOuts": "1–2 sentences on common pitfalls and classroom management."
}

Be concrete. If the original activity is too abstract for the target age, redesign it (don't just simplify text). Use TPR, games, visuals, and realia for younger learners.`,

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
    { "word": "the word or short phrase", "partOfSpeech": "noun|verb|adj|phrase", "sentence": "A short, kid-friendly example sentence using the word." }
  ],
  "chant": "A short, rhythmic chant or song hook using several of the words (4–8 lines, fun, repetitive).",
  "games": [
    { "name": "Game name", "howTo": "2-sentence description a teacher can use right away." },
    { "name": "Game name", "howTo": "..." },
    { "name": "Game name", "howTo": "..." }
  ]
}

Make sure:
- The number of cards matches the requested count exactly.
- Words are level-appropriate (don't put advanced vocab in Pre-A1).
- Example sentences use kid-friendly contexts (school, family, animals, food, play).
- At least one of the games is TPR-based for younger learners.`,
};

function buildPrompt(type, inputs) {
  const builder = PROMPTS[type];
  if (!builder) throw new Error(`Unknown type: ${type}`);
  return builder(inputs);
}

function extractJson(text) {
  // Claude is told to return raw JSON, but be defensive.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY env var." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  const { type, inputs } = body || {};
  if (!type || !inputs) {
    res.status(400).json({ error: "Missing 'type' or 'inputs' in request body." });
    return;
  }

  let prompt;
  try {
    prompt = buildPrompt(type, inputs);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
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
        max_tokens: 2400,
        system: BASE_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({
        error: `Anthropic API error: ${upstream.status}`,
        detail: errText.slice(0, 500),
      });
      return;
    }

    const data = await upstream.json();
    const text = (data.content || []).map((p) => p.text || "").join("");

    let parsed;
    try {
      parsed = extractJson(text);
    } catch (_) {
      res.status(502).json({ error: "Model didn't return valid JSON.", raw: text.slice(0, 400) });
      return;
    }

    res.status(200).json({ result: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error." });
  }
};
