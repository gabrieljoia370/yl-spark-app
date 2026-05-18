// YL Spark — frontend logic
// Plain vanilla JS, no build step.

const STORAGE_KEY = "ylspark.library.v1";
const API_ENDPOINT = "/api/generate";

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

/* ---------- Loader + toast ---------- */
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loader-text");
function showLoader(text) {
  loaderText.textContent = text || "Working…";
  loader.hidden = false;
}
function hideLoader() {
  loader.hidden = true;
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
      headers: { "Content-Type": "application/json" },
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
  showLoader("Drafting your lesson…");
  try {
    const { result } = await callApi({ type: "lesson", inputs });
    renderLesson(inputs, result);
  } catch (err) {
    showError("lesson", err.message);
  } finally {
    hideLoader();
  }
});

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
  showLoader("Adapting the activity…");
  try {
    const { result } = await callApi({ type: "adapter", inputs });
    renderAdapter(inputs, result);
  } catch (err) {
    showError("adapter", err.message);
  } finally {
    hideLoader();
  }
});

function renderAdapter(inputs, r) {
  const out = document.getElementById("output-adapter");
  out.hidden = false;
  out.innerHTML = `
    <div class="output-toolbar">
      <button class="btn ghost small" data-act="save">Save</button>
      <button class="btn ghost small" data-act="copy">Copy</button>
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
  showLoader("Building your vocab set…");
  try {
    const { result } = await callApi({ type: "flashcards", inputs });
    renderFlashcards(inputs, result);
  } catch (err) {
    showError("flashcards", err.message);
  } finally {
    hideLoader();
  }
});

function renderFlashcards(inputs, r) {
  const out = document.getElementById("output-flashcards");
  out.hidden = false;
  const cards = (r.cards || [])
    .map(
      (c) => `
      <div class="flashcard">
        <div class="word">${escapeHtml(c.word || "")}</div>
        ${c.partOfSpeech ? `<div class="pos">${escapeHtml(c.partOfSpeech)}</div>` : ""}
        ${c.sentence ? `<div class="sentence">${escapeHtml(c.sentence)}</div>` : ""}
      </div>`
    )
    .join("");
  out.innerHTML = `
    <div class="output-toolbar">
      <button class="btn ghost small" data-act="save">Save</button>
      <button class="btn ghost small" data-act="copy">Copy</button>
      <button class="btn ghost small" data-act="print">Print</button>
    </div>
    <h2>${escapeHtml(r.title || inputs.topic)}</h2>
    <div class="meta-row">
      <span class="chip">${escapeHtml(inputs.ageGroup)}</span>
      <span class="chip">${escapeHtml(inputs.level)}</span>
      <span class="chip">${(r.cards || []).length} items</span>
    </div>
    <h3>Vocabulary set</h3>
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

/* ---------- Output toolbar (save / copy / print) ---------- */
function wireToolbar(outputEl, item) {
  outputEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "save") {
        saveToLibrary(item);
      } else if (act === "copy") {
        copyOutput(outputEl);
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

/* ---------- Loader cancel button ---------- */
document.getElementById("loader-cancel").addEventListener("click", () => {
  cancelActiveRequest();
  hideLoader();
});

/* ---------- Init ---------- */
document.getElementById("lib-count").textContent = loadLibrary().length;
