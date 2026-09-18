const PAYLOAD = JSON.parse(document.getElementById("data").textContent);
const BASELINE_NAME = PAYLOAD.baselineName || "";
const INTENSITY_LEVELS = PAYLOAD.intensities;
const armLabel = (e) => e.host + " · " + e.model;
const ALL = PAYLOAD.entries;
const originals = new Map();
for (const e of ALL.filter(x => x.profile === "control")) originals.set(armLabel(e) + "|" + e.caseId, e.reply);
const ITEMS = ALL.filter(x => x.profile !== "control");
const arms = [...new Set(ITEMS.map(armLabel))].sort();
const profiles = [...new Set(ITEMS.map(e => e.profile))].sort();
const cases = [...new Set(ITEMS.map(e => e.caseId))];
const changed = (e) => e && e.baseline !== undefined && e.baseline !== e.reply;
const pairs = [];
for (const p of profiles) for (const c of cases) {
  if (ITEMS.some(e => e.profile === p && e.caseId === c)) pairs.push({ profile: p, caseId: c });
}
const state = { pairIdx: 0, view: "grid", arm: arms.find(a => a.includes("sonnet")) || arms[0], originalArm: "", run: 1, delta: "all" };
const shortArm = (a) => a.split(" · ")[1] || a;
const showBaselineFor = new Set();
let feedback = {}, apiOk = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const panelByAttr = (attr, key) => $("panels").querySelector("[data-" + attr + '="' + CSS.escape(key) + '"]');
function partsFor(e){
  return feedbackParts(feedback[e.key], e.ranAt);
}
function cellsFor(pair){
  return ITEMS.filter(e => e.profile === pair.profile && e.caseId === pair.caseId);
}
function pairChanged(pair){
  return cellsFor(pair).some(changed);
}
function visiblePairs(){
  return state.delta === "all" ? pairs : pairs.filter(pairChanged);
}
function cellAt(pair, intensity, arm = state.arm){
  const runs = cellsFor(pair).filter(e => armLabel(e) === arm && e.intensity === intensity);
  return runs.find(e => e.run === state.run) || runs[0];
}
function chipRow(el, values, key){
  el.innerHTML = "";
  for (const v of values) {
    const b = document.createElement("button");
    b.className = "chip" + (String(state[key]) === String(v) ? " on" : "");
    b.textContent = v;
    b.onclick = () => { state[key] = v; if (key !== "run") state.run = 1; render(); };
    el.appendChild(b);
  }
}
function selRow(el, values, selected, onpick, labelFor){
  el.innerHTML = "";
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v; o.textContent = labelFor ? labelFor(v) : v;
    el.appendChild(o);
  }
  el.value = selected;
  el.onchange = () => onpick(el.value);
}
function replyHtml(markdown){
  return markdown === undefined
    ? '<p class="empty">No output for this combination.</p>'
    : DOMPurify.sanitize(marked.parse(markdown));
}
function panelHtml(e, intensity, pair, armName){
  const showBase = e && changed(e) && showBaselineFor.has(e.key);
  const changeTag = e && BASELINE_NAME
    ? (e.baseline === undefined ? "" : changed(e) ? '<span class="tag M">changed</span>' : '<span class="tag P">same</span>')
    : "";
  const blButton = e && changed(e)
    ? '<button class="blbtn' + (showBase ? " on" : "") + '" data-bl="' + esc(e.key) + '">' + (showBase ? "baseline ✓" : "⇄ baseline") + "</button>"
    : "";
  const greet = e && e.greeting && e.host !== "pi"
    ? '<details class="greet"><summary>greeting</summary><p>' + esc(e.greeting.trim()) + "</p></details>"
    : "";
  const fb = e ? feedbackHtml(e) : "";
  const ai = e && e.note ? aiHtml(e) : "";
  const titleBase = pair.profile + " " + intensity + (armName ? " · " + shortArm(armName) : "");
  const titleAttrs = e ? ' data-title="' + esc(e.key) + '" data-base="' + esc(titleBase) + '"' : "";
  const replyAttrs = e ? ' data-reply="' + esc(e.key) + '"' : "";
  return '<div class="panelbox styled"><header><span class="dot"></span><span' + titleAttrs + ">" +
    esc(titleBase) + (showBase ? " · baseline" : "") + "</span>" +
    changeTag + blButton + "</header>" + greet +
    '<article class="reply"' + replyAttrs + ">" + replyHtml(e ? (showBase ? e.baseline : e.reply) : undefined) + "</article>" + ai + fb + "</div>";
}
function aiHtml(e){
  const stale = noteIsStale(e.noteAt, e.ranAt);
  const agreed = !stale && partsFor(e).current.rating === "agree";
  const label = stale ? "Claude’s take · previous output" : "Claude’s take";
  const agreeButton = stale
    ? ""
    : '<button class="agreebtn' + (agreed ? " on" : "") + '" data-agree="' + esc(e.key) + '">' +
      (agreed ? "Agreed ✓" : "✓ Agree") + "</button>";
  return '<div class="ai"><div class="ailabel"><span>' + label + "</span>" + agreeButton + "</div><p>" + esc(e.note) + "</p></div>";
}
function pastHtml(item){
  const when = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "";
  const rating = item.rating ? esc(ratingLabel(item.rating)) + " " : "";
  return '<div class="pastfb"><span class="pastlabel">earlier feedback · previous output' + (when ? " · " + esc(when) : "") + "</span><p>" +
    rating + esc(item.text || "") + "</p></div>";
}
function feedbackHtml(e){
  const parts = partsFor(e);
  const current = parts.current;
  const rateBtn = (r, label) =>
    '<button data-rate="' + r + '" data-key="' + esc(e.key) + '"' + (current.rating === r ? ' class="on"' : "") + ">" + label + "</button>";
  return '<div class="fb">' + parts.past.map(pastHtml).join("") + '<div class="rate">' +
    rateBtn("good", "👍") + rateBtn("meh", "😐") + rateBtn("bad", "👎") +
    '</div><textarea data-text="' + esc(e.key) + '" placeholder="Feedback on this output…">' + esc(current.text || "") + "</textarea>" +
    '<div class="fbrow"><button data-save="' + esc(e.key) + '">Save</button><span class="fbstate" data-state="' + esc(e.key) + '">' +
    (current.updatedAt ? "saved earlier" : "") + "</span></div></div>";
}
function render(){
  const list = visiblePairs();
  if (state.pairIdx >= list.length) state.pairIdx = Math.max(0, list.length - 1);
  const pair = list[state.pairIdx];
  $("count").textContent = list.length + " of " + pairs.length + " voices shown";
  $("prev").disabled = state.pairIdx <= 0;
  $("next").disabled = state.pairIdx >= list.length - 1;
  $("pos").textContent = list.length ? (state.pairIdx + 1) + " / " + list.length : "0 / 0";
  if (!pair) { $("pairTitle").textContent = ""; $("panels").innerHTML = ""; return; }
  selRow($("profileSel"), profiles, pair.profile, (v) => {
    const idx = visiblePairs().findIndex(pr => pr.profile === v);
    if (idx >= 0) { state.pairIdx = idx; state.run = 1; }
    render();
  });
  selRow($("caseSel"), cases, pair.caseId, (v) => {
    const vis = visiblePairs();
    let idx = vis.findIndex(pr => pr.profile === pair.profile && pr.caseId === v);
    if (idx < 0) idx = vis.findIndex(pr => pr.caseId === v);
    if (idx >= 0) { state.pairIdx = idx; state.run = 1; }
    render();
  }, (v) => {
    const n = pairs.filter(pr => pr.caseId === v).length;
    return v + " (" + n + (n === 1 ? " voice)" : " voices)");
  });
  if (BASELINE_NAME) {
    $("deltaGroup").hidden = false;
    chipRow($("deltaChips"), ["all", "changed"], "delta");
  }
  $("pairTitle").textContent = pair.profile + " · " + pair.caseId;
  chipRow($("viewChips"), ["grid", "arm"], "view");
  $("armGroup").hidden = state.view === "grid";
  if (state.view === "grid") {
    renderGrid(pair);
  } else {
    chipRow($("armChips"), arms, "arm");
    const cells = INTENSITY_LEVELS.map(i => cellAt(pair, i));
    const runValues = [...new Set(cellsFor(pair).filter(e => armLabel(e) === state.arm).map(e => e.run))].sort();
    $("runGroup").hidden = runValues.length <= 1;
    if (runValues.length > 1) chipRow($("runChips"), runValues, "run");
    $("panels").className = "panels";
    $("panels").style.removeProperty("--unified-cols");
    $("panels").style.removeProperty("--unified-rows");
    $("panels").innerHTML =
      '<div class="panelbox"><header><span class="dot"></span><span>Original · Mouthfeel off · ' + esc(state.arm) + "</span></header>" +
      '<article class="reply">' + replyHtml(originals.get(state.arm + "|" + pair.caseId)) + "</article></div>" +
      cells.map((e, i) => panelHtml(e, INTENSITY_LEVELS[i], pair)).join("");
  }
  wirePanels(pair);
}
function originalPanelHtml(pair){
  const controlArms = arms.filter(a => originals.has(a + "|" + pair.caseId));
  if (!controlArms.includes(state.originalArm)) {
    state.originalArm = controlArms.find(a => a.includes("sonnet")) || controlArms[0] || state.arm;
  }
  const header = controlArms.length > 1
    ? controlArms.map(a =>
        '<button class="oarm' + (a === state.originalArm ? " on" : "") + '" data-oarm="' + esc(a) + '">' + esc(shortArm(a)) + "</button>"
      ).join("")
    : "<span>· " + esc(shortArm(state.originalArm)) + "</span>";
  return '<div class="panelbox original"><header><span class="dot"></span><span>Original · off</span>' + header + "</header>" +
    '<article class="reply">' + replyHtml(originals.get(state.originalArm + "|" + pair.caseId)) + "</article></div>";
}
function renderGrid(pair){
  $("runGroup").hidden = true;
  const cells = [];
  for (const i of INTENSITY_LEVELS) for (const a of arms) cells.push({ e: cellAt(pair, i, a), intensity: i, arm: a });
  const panels = $("panels");
  panels.className = "panels unified";
  panels.style.setProperty("--unified-cols", String(arms.length + 1));
  panels.style.setProperty("--unified-rows", String(INTENSITY_LEVELS.length));
  panels.innerHTML = originalPanelHtml(pair) + cells.map(c => panelHtml(c.e, c.intensity, pair, c.arm)).join("");
}
function wirePanels(pair){
  for (const b of $("panels").querySelectorAll("[data-bl]")) {
    b.onclick = () => {
      const k = b.dataset.bl;
      const e = entryByKey(k);
      const showBase = !showBaselineFor.has(k);
      if (showBase) showBaselineFor.add(k); else showBaselineFor.delete(k);
      const article = panelByAttr("reply", k);
      if (article) article.innerHTML = replyHtml(showBase ? e.baseline : e.reply);
      const titleEl = panelByAttr("title", k);
      if (titleEl) titleEl.textContent = titleEl.dataset.base + (showBase ? " · baseline" : "");
      b.classList.toggle("on", showBase);
      b.textContent = showBase ? "baseline ✓" : "⇄ baseline";
    };
  }
  for (const b of $("panels").querySelectorAll("[data-rate]")) {
    b.onclick = () => {
      const group = b.closest(".rate");
      const on = b.classList.contains("on");
      for (const x of group.querySelectorAll("button")) x.classList.remove("on");
      if (!on) b.classList.add("on");
      group.dataset.touched = "1";
    };
  }
  for (const b of $("panels").querySelectorAll("[data-save]")) {
    b.onclick = () => saveFeedback(b.dataset.save);
  }
  for (const b of $("panels").querySelectorAll("[data-agree]")) {
    b.onclick = () => toggleAgree(b.dataset.agree);
  }
  const wireOarm = () => {
    for (const b of $("panels").querySelectorAll("[data-oarm]")) {
      b.onclick = () => {
        state.originalArm = b.dataset.oarm;
        const box = $("panels").querySelector(".panelbox.original");
        if (!box) return;
        box.outerHTML = originalPanelHtml(pair);
        wireOarm();
      };
    }
  };
  wireOarm();
}
function entryByKey(key){
  return ITEMS.find(e => e.key === key);
}
async function postFeedback(e, rating, text){
  const parts = partsFor(e);
  const payload = {
    key: e.key,
    text,
    rating,
    profile: e.profile, intensity: e.intensity, arm: armLabel(e), caseId: e.caseId, run: e.run,
    updatedAt: new Date().toISOString(),
    ...(parts.stale ? { archivePrevious: true } : {}),
  };
  const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(String(res.status));
  const body = await res.json().catch(() => null);
  feedback[e.key] = body && body.row ? body.row : payload;
  refreshCount();
}
async function saveFeedback(key){
  const e = entryByKey(key);
  const box = panelByAttr("text", key);
  const stateEl = panelByAttr("state", key);
  const group = panelByAttr("key", key)?.closest(".rate");
  const rated = group ? group.querySelector("button.on") : null;
  if (!e || !box || !stateEl) return;
  if (!apiOk) { stateEl.textContent = "no server — run npm run eval:serve"; return; }
  // An untouched rating keeps its stored value; an explicit clear writes through.
  const rating = rated ? rated.dataset.rate : (group && group.dataset.touched ? "" : partsFor(e).current.rating || "");
  stateEl.textContent = "saving…";
  try {
    await postFeedback(e, rating, box.value);
    stateEl.textContent = "saved ✓";
  } catch {
    stateEl.textContent = "save failed — is the server still running?";
  }
}
async function toggleAgree(key){
  const e = entryByKey(key);
  const btn = panelByAttr("agree", key);
  if (!e || !btn) return;
  if (!apiOk) { btn.textContent = "no server — run npm run eval:serve"; return; }
  const parts = partsFor(e);
  const box = panelByAttr("text", key);
  const agreeing = parts.current.rating !== "agree";
  try {
    await postFeedback(e, agreeing ? "agree" : "", box ? box.value : (parts.current.text || ""));
    btn.classList.toggle("on", agreeing);
    btn.textContent = agreeing ? "Agreed ✓" : "✓ Agree";
    for (const x of $("panels").querySelectorAll('[data-key="' + CSS.escape(key) + '"]')) x.classList.remove("on");
    const group = panelByAttr("key", key)?.closest(".rate");
    if (group) delete group.dataset.touched;
    const stateEl = panelByAttr("state", key);
    if (stateEl) stateEl.textContent = agreeing ? "agreed with Claude ✓" : "";
  } catch {
    btn.textContent = "save failed";
  }
}
function refreshCount(){
  const n = Object.keys(feedback).length;
  $("fbCount").textContent = n ? n + " feedback rows saved" : "";
}
$("prev").onclick = () => { state.pairIdx--; state.run = 1; render(); };
$("next").onclick = () => { state.pairIdx++; state.run = 1; render(); };
document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "TEXTAREA" || ev.target.tagName === "SELECT") return;
  if (ev.key === "ArrowLeft" && !$("prev").disabled) { state.pairIdx--; state.run = 1; render(); }
  if (ev.key === "ArrowRight" && !$("next").disabled) { state.pairIdx++; state.run = 1; render(); }
});
render();
fetch("/api/feedback").then(async (res) => {
  if (!res.ok) throw new Error(String(res.status));
  feedback = await res.json();
  apiOk = true;
  refreshCount();
  render();
}).catch(() => { $("apiNote").hidden = false; });
