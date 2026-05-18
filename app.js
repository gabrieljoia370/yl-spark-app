// YL Spark — frontend logic
// Plain vanilla JS, no build step.

const STORAGE_KEY = "ylspark.library.v1";
const API_ENDPOINT = "/api/generate";
const IMAGE_ENDPOINT = "/api/generate-image";

/* ---------- Commercial MVP: config + Supabase auth + usage ---------- */
let appConfig = { freeLimit: 3, paymentLink: "#pricing", supabaseUrl: "", supabaseAnonKey: "", price: 390, currency: "UYU" };
let supabaseClient = null;
let currentSession = null;

async function initCommercialMvp() {
  try {
    const res = await fetch("/api/config");
    appConfig = await res.json();

    setupUpgradeButtons();
    updatePricingText();

    if (appConfig.supabaseUrl && appConfig.supabaseAnonKey && window.supabase) {
      supabaseClient = window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
      const { data } = await supabaseClient.auth.getSession();
      currentSession = data.session || null;
      await refreshAccountUi();
      supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        currentSession = session;
        await refreshAccountUi();
      });
    } else {
      setAccountText("Login not configured", "Add Supabase env vars in Vercel.");
    }
  } catch (err) {
    setAccountText("Account system unavailable", err.message || "Could not load config.");
  }
}


function updatePricingText() {
  const priceEls = document.querySelectorAll("[data-price]");
  priceEls.forEach((el) => {
    el.textContent = `${appConfig.currency || "UYU"} ${appConfig.price || 390}`;
  });
}

function setupUpgradeButtons() {
  const buttons = [document.getElementById("payment-link"), document.getElementById("upgrade-link")].filter(Boolean);
  buttons.forEach((btn) => {
    btn.href = "#pricing";
    if (btn.dataset.checkoutReady === "true") return;
    btn.dataset.checkoutReady = "true";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await startMercadoPagoCheckout(btn);
    });
  });
}

async function startMercadoPagoCheckout(button) {
  if (!currentSession?.access_token) {
    toast("Please sign in first, then choose Upgrade.");
    document.getElementById("auth-email")?.focus();
    return;
  }

  const originalText = button.textContent;
  button.textContent = "Opening Mercado Pago…";
  button.setAttribute("aria-busy", "true");

  try {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentSession.access_token}`,
      },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not open Mercado Pago checkout.");

    if (data.alreadyPaid) {
      toast(data.message || "Your plan is already active.");
      await refreshAccountUi();
      return;
    }

    const url = data.init_point || data.sandbox_init_point;
    if (!url) throw new Error("Mercado Pago did not return a checkout link.");
    window.location.href = url;
  } catch (err) {
    toast(err.message || "Could not open checkout.");
  } finally {
    button.textContent = originalText;
    button.removeAttribute("aria-busy");
  }
}

function showPaymentReturnMessage() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");
  if (!payment) return;
  if (payment === "success") toast("Payment received. Your Teacher Plan should activate shortly.");
  if (payment === "pending") toast("Payment pending. Your plan will activate when Mercado Pago confirms it.");
  if (payment === "failure") toast("Payment was not completed. You can try again from Upgrade.");
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}

function setAccountText(main, sub) {
  const status = document.getElementById("account-status");
  const usage = document.getElementById("usage-status");
  if (status) status.textContent = main;
  if (usage) usage.textContent = sub || "";
}

async function refreshAccountUi() {
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const loginBtn = document.getElementById("login-btn");
  const signupBtn = document.getElementById("signup-btn");
  const googleBtn = document.getElementById("google-btn");
  const resetBtn = document.getElementById("reset-btn");
  const logoutBtn = document.getElementById("logout-btn");

  if (!currentSession) {
    setAccountText("Not signed in", `Sign in to use your ${appConfig.freeLimit || 3} free sparks.`);
    if (emailInput) emailInput.hidden = false;
    if (passwordInput) passwordInput.hidden = false;
    if (loginBtn) loginBtn.hidden = false;
    if (signupBtn) signupBtn.hidden = false;
    if (googleBtn) googleBtn.hidden = false;
    if (resetBtn) resetBtn.hidden = false;
    if (logoutBtn) logoutBtn.hidden = true;
    return;
  }

  if (emailInput) emailInput.hidden = true;
  if (passwordInput) passwordInput.hidden = true;
  if (loginBtn) loginBtn.hidden = true;
  if (signupBtn) signupBtn.hidden = true;
  if (googleBtn) googleBtn.hidden = true;
  if (resetBtn) resetBtn.hidden = true;
  if (logoutBtn) logoutBtn.hidden = false;

  const usage = await fetchUsage();
  appConfig.plan = usage.plan || "free";
  const email = currentSession.user?.email || "Signed in";
  if (usage.plan === "paid") {
    setAccountText(email, "Teacher Plan active · unlimited generations.");
  } else {
    const used = usage.used || 0;
    const limit = usage.freeLimit || appConfig.freeLimit || 3;
    const left = Math.max(0, limit - used);
    setAccountText(email, `${used}/${limit} free generations used · ${left} left.`);
  }
}

async function fetchUsage() {
  try {
    const token = currentSession?.access_token;
    if (!token) return { used: 0, freeLimit: appConfig.freeLimit || 3, plan: "free" };
    const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { used: 0, freeLimit: appConfig.freeLimit || 3, plan: "free" };
    return res.json();
  } catch (_) {
    return { used: 0, freeLimit: appConfig.freeLimit || 3, plan: "free" };
  }
}

function getAuthFields() {
  return {
    email: document.getElementById("auth-email")?.value?.trim(),
    password: document.getElementById("auth-password")?.value || "",
  };
}

function authErrorMessage(error) {
  if (!error) return "Something went wrong.";
  if (/Invalid login credentials/i.test(error.message)) return "Email or password is incorrect.";
  if (/Password should be at least/i.test(error.message)) return "Password must be at least 6 characters.";
  return error.message || "Something went wrong.";
}

document.getElementById("login-btn")?.addEventListener("click", async () => {
  if (!supabaseClient) return toast("Login is not configured yet.");
  const { email, password } = getAuthFields();
  if (!email || !password) return toast("Enter your email and password.");
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) toast(authErrorMessage(error));
  else toast("Logged in.");
});

document.getElementById("signup-btn")?.addEventListener("click", async () => {
  if (!supabaseClient) return toast("Login is not configured yet.");
  const { email, password } = getAuthFields();
  if (!email || !password) return toast("Enter your email and a password.");
  const { error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) toast(authErrorMessage(error));
  else toast("Account created. Check your email if confirmation is required.");
});

document.getElementById("google-btn")?.addEventListener("click", async () => {
  if (!supabaseClient) return toast("Login is not configured yet.");
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
  if (error) toast(authErrorMessage(error));
});

document.getElementById("reset-btn")?.addEventListener("click", async () => {
  if (!supabaseClient) return toast("Login is not configured yet.");
  const { email } = getAuthFields();
  if (!email) return toast("Enter your email first.");
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) toast(authErrorMessage(error));
  else toast("Password reset email sent.");
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentSession = null;
  await refreshAccountUi();
});

function requireLoginBeforeGenerate() {
  if (!currentSession?.access_token) {
    toast("Please sign in first.");
    document.getElementById("auth-email")?.focus();
    throw new Error("Please sign in first to generate materials.");
  }
}

showPaymentReturnMessage();
initCommercialMvp();


/* ---------- Tab switching ---------- */
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const id = tab.dataset.tab;
    tabs.forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab ? "true" : "false");
    });
    panels.forEach((p) => {
      const match = p.id === `panel-${id}`;
      p.classList.toggle("active", match);
      p.hidden = !match;
    });
    if (id === "library") renderLibrary();
  });
});

/* ---------- Inline loading + toast ---------- */
function setFormLoading(form, isLoading, loadingText) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.innerHTML =
      '<span class="btn-spinner" aria-hidden="true"></span>' +
      escapeHtml(loadingText || "Working…");
    btn.disabled = true;
  } else {
    if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
    btn.disabled = false;
  }
}

function showOutputLoading(panelId, message) {
  const out = document.getElementById(`output-${panelId}`);
  if (!out) return;
  out.hidden = false;
  out.innerHTML =
    '<div class="output-loading"><span class="output-spinner" aria-hidden="true"></span><span>' +
    escapeHtml(message || "Working…") +
    "</span></div>";
}

function clearOutput(panelId) {
  const out = document.getElementById(`output-${panelId}`);
  if (!out) return;
  out.innerHTML = "";
  out.hidden = true;
}

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

/* ---------- API call ---------- */
let activeAbortController = null;
let activeTimeoutId = null;
const REQUEST_TIMEOUT_MS = 75000;

async function callApi(payload) {
  if (activeAbortController) activeAbortController.abort();
  activeAbortController = new AbortController();
  activeTimeoutId = setTimeout(() => {
    if (activeAbortController) activeAbortController.abort();
  }, REQUEST_TIMEOUT_MS);
  const signal = activeAbortController.signal;

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentSession?.access_token || ""}` },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j.error || j.message || "";
      } catch (_) {}
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "The request was cancelled or took longer than 75 seconds. The most common cause is a missing or invalid ANTHROPIC_API_KEY on Vercel. Go to your Vercel project → Settings → Environment Variables and check it's set for Production, then redeploy."
      );
    }
    throw err;
  } finally {
    if (activeTimeoutId) clearTimeout(activeTimeoutId);
    activeTimeoutId = null;
    activeAbortController = null;
  }
}

function cancelActiveRequest() {
  if (activeAbortController) activeAbortController.abort();
}

/* ---------- Form helpers ---------- */
function formValues(form) {
  const data = {};
  new FormData(form).forEach((v, k) => (data[k] = v));
  return data;
}

function showError(panelId, msg) {
  const out = document.getElementById(`output-${panelId}`);
  out.hidden = false;
  out.innerHTML = `<div class="error"><strong>Something went wrong.</strong><br>${escapeHtml(msg)}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/* ---------- LESSON PLAN ---------- */
document.getElementById("form-lesson").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputs = formValues(e.target);
  try { requireLoginBeforeGenerate(); } catch (err) { showError("lesson", err.message); return; }
  setFormLoading(e.target, true, "Drafting…");
  showOutputLoading("lesson", "Drafting your lesson… usually takes 10–20 seconds.");
  try {
    const { result } = await callApi({ type: "lesson", inputs });
    renderLesson(inputs, result);
    await refreshAccountUi();
  } catch (err) {
    showError("lesson", err.message);
  } finally {
    setFormLoading(e.target, false);
  }
});


function renderVisualSupports(v) {
  if (!v) return "";
  const flashcards = v.flashcardIdeas || v.imagesOrFlashcards || [];
  const imagePrompts = v.imagePrompts || [];
  const noPrep = v.noPrepAlternatives || v.noPrepVisuals || [];
  return `
    <h3>Visual supports</h3>
    <div class="visual-supports">
      ${v.boardPicture ? `<div class="visual-card"><strong>Board picture</strong><p>${escapeHtml(v.boardPicture)}</p></div>` : ""}
      ${flashcards.length ? `<div class="visual-card"><strong>Picture / flashcard ideas</strong><ul>${flashcards.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
      ${imagePrompts.length ? `<div class="visual-card"><strong>AI image prompts</strong><ul>${imagePrompts.map((x) => `<li><code>${escapeHtml(x)}</code></li>`).join("")}</ul><p class="hint">Copy these into Canva, Adobe Express, Ideogram, DALL·E or another image tool.</p></div>` : ""}
      ${noPrep.length ? `<div class="visual-card"><strong>No-print options</strong><ul>${noPrep.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></div>` : ""}
    </div>`;
}

function renderImagePrompt(prompt) {
  if (!prompt) return "";
  return `<div class="image-prompt"><strong>Image idea:</strong> ${escapeHtml(prompt)}</div>`;
}

function getFlashcardImageSrc(card) {
  return card.imageBase64 || card.imageUrl || "";
}

function renderFlashcardImage(card, index) {
  const src = getFlashcardImageSrc(card);
  if (src) {
    return `<div class="flashcard-image-wrap" data-image-slot="${index}"><img class="flashcard-image" src="${escapeHtml(src)}" alt="${escapeHtml(card.word || "Flashcard image")}" loading="lazy"></div>`;
  }
  return `<div class="flashcard-image-placeholder" data-image-slot="${index}"><span>Image will appear here</span></div>`;
}

async function generateImagesForRenderedFlashcards(inputs, result) {
  if (!result?.cards?.length) return;

  const status = document.getElementById("flashcard-image-status");
  const maxImages = appConfig.plan === "paid" ? 12 : 4;
  const cardsToGenerate = result.cards.slice(0, maxImages);

  if (status) status.textContent = `Generating ${cardsToGenerate.length} flashcard image${cardsToGenerate.length === 1 ? "" : "s"}…`;

  let generated = 0;

  for (let i = 0; i < cardsToGenerate.length; i++) {
    const card = cardsToGenerate[i];

    try {
      const res = await fetch(IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession?.access_token || ""}`,
        },
        body: JSON.stringify({
          topic: inputs.topic,
          ageGroup: inputs.ageGroup,
          level: inputs.level,
          card: {
            word: card.word || "",
            sentence: card.sentence || "",
            imagePrompt: card.imagePrompt || "",
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Image request failed (${res.status})`);

      result.cards[i].imageUrl = data.imageUrl || "";
      result.cards[i].imageBase64 = data.imageBase64 || "";

      const src = result.cards[i].imageBase64 || result.cards[i].imageUrl;
      const slot = document.querySelector(`[data-image-slot="${i}"]`);

      if (slot && src) {
        slot.outerHTML = `<div class="flashcard-image-wrap" data-image-slot="${i}"><img class="flashcard-image" src="${escapeHtml(src)}" alt="${escapeHtml(result.cards[i].word || "Flashcard image")}" loading="lazy"></div>`;
      }

      generated++;
      if (status) status.textContent = `Generated ${generated}/${cardsToGenerate.length} flashcard images…`;
    } catch (err) {
      const slot = document.querySelector(`[data-image-slot="${i}"]`);
      if (slot) {
        slot.classList.add("image-failed");
        slot.innerHTML = `<span>Image failed: ${escapeHtml(err.message || "error")}</span>`;
      }
      if (status) status.textContent = `Image generation error: ${err.message || "Unknown error"}`;
    }
  }

  if (status && generated > 0) {
    status.textContent = result.cards.length > maxImages
      ? `Images added to ${generated} cards. Free preview shows ${maxImages}; upgrade for full sets.`
      : `Images added to ${generated} cards.`;
  }
}

function renderLesson(inputs, plan) {
  const out = document.getElementById("output-lesson");
  out.hidden = false;
  const stages = (plan.stages || [])
    .map(
      (s) => `
      <div class="stage">
        <h4>${escapeHtml(s.name)} <span class="hint">· ${escapeHtml(s.minutes || "")} min</span></h4>
        <p><strong>Aim:</strong> ${escapeHtml(s.aim || "")}</p>
        <p><strong>Steps:</strong></p>
        <ol>${(s.steps || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
        ${s.teacherLanguage ? `<p><strong>Teacher language:</strong> <em>${escapeHtml(s.teacherLanguage)}</em></p>` : ""}
      </div>`
    )
    .join("");
  out.innerHTML = `
    <div class="output-toolbar">
      <button class="btn ghost small" data-act="save">Save</button>
      <button class="btn ghost small" data-act="copy">Copy</button>
      <button class="btn ghost small" data-act="pdf">Download PDF</button>
      <button class="btn ghost small" data-act="print">Print</button>
    </div>
    <h2>${escapeHtml(plan.title || inputs.topic)}</h2>
    <div class="meta-row">
      <span class="chip">${escapeHtml(inputs.ageGroup)}</span>
      <span class="chip">${escapeHtml(inputs.level)}</span>
      <span class="chip">${escapeHtml(inputs.duration)}</span>
      <span class="chip">${escapeHtml(inputs.classSize)}</span>
    </div>
    ${plan.overallAim ? `<p><strong>Overall aim:</strong> ${escapeHtml(plan.overallAim)}</p>` : ""}
    ${plan.materials ? `<p><strong>Materials:</strong> ${escapeHtml(plan.materials)}</p>` : ""}
    ${plan.targetLanguage ? `<p><strong>Target language:</strong> ${escapeHtml(plan.targetLanguage)}</p>` : ""}
    ${renderVisualSupports(plan.visualSupports)}
    <h3>Lesson stages</h3>
    ${stages}
    ${plan.differentiation ? `<h3>Differentiation</h3><p>${escapeHtml(plan.differentiation)}</p>` : ""}
    ${plan.assessment ? `<h3>Quick check / assessment</h3><p>${escapeHtml(plan.assessment)}</p>` : ""}
    ${plan.homework ? `<h3>Optional homework</h3><p>${escapeHtml(plan.homework)}</p>` : ""}
  `;
  wireToolbar(out, {
    type: "lesson",
    title: plan.title || inputs.topic,
    inputs,
    result: plan,
  });
}

/* ---------- ACTIVITY ADAPTER ---------- */
document.getElementById("form-adapter").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputs = formValues(e.target);
  try { requireLoginBeforeGenerate(); } catch (err) { showError("adapter", err.message); return; }
  setFormLoading(e.target, true, "Adapting…");
  showOutputLoading("adapter", "Adapting the activity… usually takes 10–15 seconds.");
  try {
    const { result } = await callApi({ type: "adapter", inputs });
    renderAdapter(inputs, result);
    await refreshAccountUi();
  } catch (err) {
    showError("adapter", err.message);
  } finally {
    setFormLoading(e.target, false);
  }
});

function renderAdapter(inputs, r) {
  const out = document.getElementById("output-adapter");
  out.hidden = false;
  out.innerHTML = `
    <div class="output-toolbar">
      <button class="btn ghost small" data-act="save">Save</button>
      <button class="btn ghost small" data-act="copy">Copy</button>
      <button class="btn ghost small" data-act="pdf">Download PDF</button>
      <button class="btn ghost small" data-act="print">Print</button>
    </div>
    <h2>${escapeHtml(r.title || "Adapted activity")}</h2>
    <div class="meta-row">
      <span class="chip">${escapeHtml(inputs.ageGroup)}</span>
      <span class="chip">${escapeHtml(inputs.level)}</span>
      <span class="chip">Goal: ${escapeHtml(inputs.goal)}</span>
    </div>
    <h3>Adapted version</h3>
    <p>${escapeHtml(r.adapted || "")}</p>
    ${r.steps ? `<h3>Step by step</h3><ol>${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : ""}
    ${renderVisualSupports(r.visualSupports)}
    ${r.scaffolding ? `<h3>Scaffolding tips</h3><ul>${r.scaffolding.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
    ${r.variations ? `<h3>Variations</h3><ul>${r.variations.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}
    ${r.watchOuts ? `<h3>Things to watch for</h3><p>${escapeHtml(r.watchOuts)}</p>` : ""}
  `;
  wireToolbar(out, {
    type: "adapter",
    title: r.title || `Adapted activity (${inputs.ageGroup}, ${inputs.level})`,
    inputs,
    result: r,
  });
}

/* ---------- FLASHCARDS ---------- */
document.getElementById("form-flashcards").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputs = formValues(e.target);
  try { requireLoginBeforeGenerate(); } catch (err) { showError("flashcards", err.message); return; }
  setFormLoading(e.target, true, "Building…");
  showOutputLoading("flashcards", "Building your vocab set… usually takes 10–15 seconds.");
  try {
    const { result } = await callApi({ type: "flashcards", inputs });
    renderFlashcards(inputs, result);
    showGenerateImagesButton(inputs, result);
    await refreshAccountUi();
  } catch (err) {
    showError("flashcards", err.message);
  } finally {
    setFormLoading(e.target, false);
  }
});

function renderFlashcards(inputs, r) {
  const out = document.getElementById("output-flashcards");
  out.hidden = false;
  const cards = (r.cards || [])
    .map(
      (c, index) => `
      <div class="flashcard visual-flashcard">
        ${renderFlashcardImage(c, index)}
        <div class="word">${escapeHtml(c.word || "")}</div>
        ${c.partOfSpeech ? `<div class="pos">${escapeHtml(c.partOfSpeech)}</div>` : ""}
        ${c.sentence ? `<div class="sentence">${escapeHtml(c.sentence)}</div>` : ""}
        ${renderImagePrompt(c.imagePrompt)}
      </div>`
    )
    .join("");
  out.innerHTML = `
    <div class="output-toolbar">
      <button class="btn ghost small" data-act="save">Save</button>
      <button class="btn ghost small" data-act="copy">Copy</button>
      <button class="btn ghost small" data-act="pdf">Download PDF</button>
      <button class="btn ghost small" data-act="print">Print</button>
    </div>
    <h2>${escapeHtml(r.title || inputs.topic)}</h2>
    <div class="meta-row">
      <span class="chip">${escapeHtml(inputs.ageGroup)}</span>
      <span class="chip">${escapeHtml(inputs.level)}</span>
      <span class="chip">${(r.cards || []).length} items</span>
    </div>
    <h3>Vocabulary set</h3>
    <p class="hint flashcard-image-status" id="flashcard-image-status"></p>
    <div class="cards-grid">${cards}</div>
    ${r.chant ? `<h3>Chant / song hook</h3><p><em>${escapeHtml(r.chant)}</em></p>` : ""}
    ${r.games ? `<h3>Mini-games</h3><ul>${r.games.map((g) => `<li><strong>${escapeHtml(g.name || "")}:</strong> ${escapeHtml(g.howTo || "")}</li>`).join("")}</ul>` : ""}
  `;
  wireToolbar(out, {
    type: "flashcards",
    title: r.title || inputs.topic,
    inputs,
    result: r,
  });
}


function showGenerateImagesButton(inputs, result) {
  const out = document.getElementById("output-flashcards");
  if (!out) return;

  const oldBox = document.getElementById("image-actions-box");
  if (oldBox) oldBox.remove();

  const box = document.createElement("div");
  box.id = "image-actions-box";
  box.className = "image-actions-box";
  box.innerHTML = `
    <button class="btn primary" id="generate-images-btn" type="button">Generate images for this set</button>
    <p class="hint">Optional: generate images only if you want a visual set. Free users get a limited image preview.</p>
  `;

  const toolbar = out.querySelector(".output-toolbar");
  if (toolbar) {
    toolbar.insertAdjacentElement("afterend", box);
  } else {
    out.prepend(box);
  }

  const btn = document.getElementById("generate-images-btn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Generating images…";
    await generateImagesForRenderedFlashcards(inputs, result);
    btn.textContent = "Images generated";
  });
}


/* ---------- Output toolbar (save / copy / print) ---------- */
function wireToolbar(outputEl, item) {
  outputEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "save") {
        saveToLibrary(item);
      } else if (act === "copy") {
        copyOutput(outputEl);
      } else if (act === "pdf") {
        openPdfPrintWindow(outputEl, item);
      } else if (act === "print") {
        window.print();
      }
    });
  });
}

function copyOutput(outputEl) {
  const clone = outputEl.cloneNode(true);
  clone.querySelectorAll(".output-toolbar").forEach((n) => n.remove());
  const text = clone.innerText.trim();
  navigator.clipboard
    .writeText(text)
    .then(() => toast("Copied to clipboard"))
    .catch(() => toast("Couldn't copy"));
}

function slugifyFilename(value) {
  return String(value || "yl-spark-material")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "yl-spark-material";
}

async function downloadOutputPdf(outputEl, item) {
  if (!window.html2pdf) {
    toast("PDF library is loading. Try again in a few seconds.");
    return;
  }

  const clone = outputEl.cloneNode(true);
  clone.querySelectorAll(".output-toolbar").forEach((n) => n.remove());
  clone.classList.add("pdf-export");

  const wrapper = document.createElement("div");
  wrapper.className = "pdf-page";
  wrapper.innerHTML = `
    <div class="pdf-brand">
      <img src="assets/yl-spark-logo.png" alt="YL Spark" />
      <div>
        <strong>YL Spark</strong>
        <span>Materiales de Clase para Young Learners</span>
      </div>
    </div>
  `;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    toast("Preparing PDF…");
    await window.html2pdf().set({
      margin: [8, 8, 8, 8],
      filename: `${slugifyFilename(item?.title)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    }).from(wrapper).save();
  } catch (err) {
    toast(`PDF failed: ${err.message || "try Print instead"}`);
  } finally {
    wrapper.remove();
  }
}


function openPdfPrintWindow(outputEl, item) {
  const clone = outputEl.cloneNode(true);
  clone.querySelectorAll(".output-toolbar, .image-actions-box, .flashcard-image-status, .image-prompt").forEach((n) => n.remove());

  const title = item?.title || "YL Spark material";
  const printableHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --teal: #01696f;
      --teal-dark: #014a4e;
      --teal-soft: #e6f1f2;
      --ink: #28251d;
      --muted: #6f6b62;
      --line: #ece6d8;
      --bg: #fcf8ef;
      --card: #ffffff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 28px;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      background: white;
      line-height: 1.45;
      font-size: 13px;
    }

    .pdf-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 14px;
      margin-bottom: 20px;
    }

    .pdf-brand img {
      width: 90px;
      height: auto;
      display: block;
    }

    .pdf-brand strong {
      display: block;
      font-size: 24px;
      color: var(--teal-dark);
      line-height: 1.1;
    }

    .pdf-brand span {
      display: block;
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }

    h2 {
      font-size: 26px;
      margin: 0 0 10px;
      color: var(--teal-dark);
    }

    h3 {
      font-size: 18px;
      margin: 22px 0 8px;
      color: var(--teal-dark);
    }

    h4 {
      font-size: 15px;
      margin: 16px 0 4px;
    }

    p { margin: 7px 0; }

    ul, ol {
      margin: 7px 0;
      padding-left: 22px;
    }

    li { margin: 4px 0; }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin: 8px 0 14px;
    }

    .chip {
      background: var(--teal-soft);
      color: var(--teal-dark);
      font-size: 11px;
      font-weight: bold;
      padding: 4px 9px;
      border-radius: 999px;
    }

    .stage, .visual-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      margin: 10px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 12px;
    }

    .flashcard {
      border: 1.5px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .flashcard-image-wrap,
    .flashcard-image-placeholder {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: #f7fbfb;
      display: grid;
      place-items: center;
      margin-bottom: 10px;
    }

    .flashcard-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .word {
      font-size: 22px;
      font-weight: bold;
      color: var(--teal-dark);
      margin-bottom: 4px;
    }

    .pos {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .sentence {
      font-size: 13px;
      margin-top: 8px;
    }

    .hint, .output-toolbar, .image-actions-box, .image-prompt, .flashcard-image-status {
      display: none !important;
    }

    @page {
      size: A4;
      margin: 12mm;
    }

    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="pdf-brand">
    <img src="${location.origin}/assets/yl-spark-logo.png" alt="YL Spark">
    <div>
      <strong>YL Spark</strong>
      <span>Materiales de Clase para Young Learners</span>
    </div>
  </div>

  ${clone.innerHTML}

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>
`;

  const win = window.open("", "_blank");
  if (!win) {
    toast("Popup blocked. Please allow popups to download/print the PDF.");
    return;
  }

  win.document.open();
  win.document.write(printableHtml);
  win.document.close();

  toast("PDF page opened. Choose 'Save as PDF' in the print dialog.");
}


/* ---------- Saved library ---------- */
function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (_) {
    return [];
  }
}
function persistLibrary(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  document.getElementById("lib-count").textContent = items.length;
}

function saveToLibrary(item) {
  const items = loadLibrary();
  items.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: new Date().toISOString(),
    ...item,
  });
  persistLibrary(items);
  toast("Saved");
}

function renderLibrary() {
  const list = document.getElementById("library-list");
  const empty = document.getElementById("library-empty");
  const items = loadLibrary();
  const query = (document.getElementById("lib-search").value || "").toLowerCase();
  const filtered = query
    ? items.filter((i) => JSON.stringify(i).toLowerCase().includes(query))
    : items;

  if (filtered.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.textContent = items.length === 0
      ? "Nothing saved yet. Generate a lesson, adaptation, or flashcard set and hit “Save”."
      : "No saved items match your search.";
    return;
  }
  empty.hidden = true;
  list.innerHTML = filtered
    .map((i) => {
      const typeLabel = { lesson: "Lesson plan", adapter: "Adapted activity", flashcards: "Flashcards" }[i.type] || i.type;
      const date = new Date(i.savedAt).toLocaleString();
      return `
        <div class="library-item" data-id="${i.id}">
          <div class="library-item-head">
            <div>
              <h3>${escapeHtml(i.title || "Untitled")}</h3>
              <div class="library-item-meta">${escapeHtml(typeLabel)} · ${escapeHtml(date)}</div>
            </div>
            <div class="library-item-actions">
              <button class="btn ghost small" data-libact="toggle">View</button>
              <button class="btn ghost small" data-libact="copy">Copy</button>
              <button class="btn danger small" data-libact="delete">Delete</button>
            </div>
          </div>
          <div class="library-item-body" id="libbody-${i.id}"></div>
        </div>`;
    })
    .join("");

  list.querySelectorAll(".library-item").forEach((card) => {
    const id = card.dataset.id;
    card.querySelectorAll("[data-libact]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.libact;
        const item = loadLibrary().find((x) => x.id === id);
        if (!item) return;
        if (act === "toggle") {
          const body = document.getElementById(`libbody-${id}`);
          card.classList.toggle("expanded");
          if (card.classList.contains("expanded")) {
            body.innerHTML = renderItemBody(item);
          }
        } else if (act === "copy") {
          const text = libItemToText(item);
          navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => toast("Couldn't copy"));
        } else if (act === "delete") {
          if (!confirm("Delete this saved item?")) return;
          const filteredItems = loadLibrary().filter((x) => x.id !== id);
          persistLibrary(filteredItems);
          renderLibrary();
        }
      });
    });
  });
}

function renderItemBody(item) {
  if (item.type === "lesson") {
    const r = item.result;
    return `
      ${r.overallAim ? `<p><strong>Overall aim:</strong> ${escapeHtml(r.overallAim)}</p>` : ""}
      ${(r.stages || [])
        .map(
          (s) => `<h4>${escapeHtml(s.name)} · ${escapeHtml(s.minutes || "")} min</h4>
        <p>${escapeHtml(s.aim || "")}</p>
        <ol>${(s.steps || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>`
        )
        .join("")}
    `;
  }
  if (item.type === "adapter") {
    const r = item.result;
    return `
      <p>${escapeHtml(r.adapted || "")}</p>
      ${r.steps ? `<ol>${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : ""}
    `;
  }
  if (item.type === "flashcards") {
    const r = item.result;
    return `
      <div class="cards-grid">
        ${(r.cards || [])
          .map(
            (c) =>
              `<div class="flashcard"><div class="word">${escapeHtml(c.word || "")}</div>${
                c.sentence ? `<div class="sentence">${escapeHtml(c.sentence)}</div>` : ""
              }</div>`
          )
          .join("")}
      </div>
      ${r.chant ? `<p><em>${escapeHtml(r.chant)}</em></p>` : ""}
    `;
  }
  return "";
}

function libItemToText(item) {
  return `${item.title}\n\n${JSON.stringify(item.result, null, 2)}`;
}

document.getElementById("lib-search").addEventListener("input", renderLibrary);
document.getElementById("lib-clear").addEventListener("click", () => {
  if (!confirm("Clear all saved items? This cannot be undone.")) return;
  persistLibrary([]);
  renderLibrary();
});

/* ---------- Init ---------- */
document.getElementById("lib-count").textContent = loadLibrary().length;
