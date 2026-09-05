import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { baselinePath, type BaselineRow } from "./baseline.js";
import { cellKey, collect, type Entry } from "./collect.js";
import { artifactRoot } from "./config.js";

type PageEntry = Entry & { baseline?: string };

function applyVerdicts(entries: Entry[], verdictsTable: string): void {
  const armFor = (e: Entry) => (e.host === "codex" ? 2 : e.model === "opus" ? 1 : 0);
  for (const line of verdictsTable.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8 || !cells[1] || cells[1] === "Profile" || cells[1]?.startsWith("---")) continue;
    const profile = cells[1];
    const arms = [cells[2] ?? "", cells[4] ?? "", cells[6] ?? ""];
    for (const entry of entries.filter((e) => e.profile === profile)) {
      const triple = arms[armFor(entry)]?.split("/") ?? [];
      entry.verdict = triple[entry.intensity - 1]?.trim() ?? "";
    }
  }
}

const pageTemplate = (dataJson: string) => `<title>Mouthfeel Voice Lab</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.5/purify.min.js"></script>
<style>
:root{
  --ground:#FAF9F7;--panel:#F1EEE9;--ink:#211E1A;--muted:#6E675F;--line:#DDD7CE;
  --accent:#C4633F;--accent-ink:#FFFFFF;
  --pass:#3D7A4E;--marginal:#A8781E;--fail:#A8402F;
  --chip:#E8E3DC;--chip-on:#211E1A;--chip-on-ink:#FAF9F7;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#171512;--panel:#1F1C18;--ink:#EAE5DE;--muted:#9A9288;--line:#37322B;
    --accent:#D97757;--accent-ink:#1B140F;
    --pass:#6FB383;--marginal:#D2A24C;--fail:#D97764;
    --chip:#2A2721;--chip-on:#EAE5DE;--chip-on-ink:#171512;
  }
}
:root[data-theme="dark"]{
  --ground:#171512;--panel:#1F1C18;--ink:#EAE5DE;--muted:#9A9288;--line:#37322B;
  --accent:#D97757;--accent-ink:#1B140F;
  --pass:#6FB383;--marginal:#D2A24C;--fail:#D97764;
  --chip:#2A2721;--chip-on:#EAE5DE;--chip-on-ink:#171512;
}
body{background:var(--ground);color:var(--ink);font-family:"Instrument Sans",system-ui,sans-serif;font-size:15px;line-height:1.5;}
.app{display:grid;grid-template-columns:250px 1fr;min-height:100vh;}
@media (max-width:900px){.app{grid-template-columns:1fr;}}
.rail{border-right:1px solid var(--line);padding:20px 16px;display:flex;flex-direction:column;gap:18px;background:var(--panel);}
.rail h1{font-size:17px;font-weight:600;margin:0;letter-spacing:-0.01em;}
.rail h1 span{color:var(--accent);}
.rail .sub{color:var(--muted);font-size:12.5px;margin-top:2px;}
.fgroup{display:flex;flex-direction:column;gap:6px;}
.fgroup label{font-family:"IBM Plex Mono",monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);}
.chips{display:flex;flex-wrap:wrap;gap:5px;}
.chip{border:1px solid var(--line);background:var(--chip);color:var(--ink);border-radius:999px;padding:3px 11px;font-size:12.5px;cursor:pointer;font-family:inherit;}
.chip.on{background:var(--chip-on);color:var(--chip-on-ink);border-color:var(--chip-on);}
select{background:var(--ground);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:6px 8px;font-family:inherit;font-size:13px;}
.count{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted);}
.main{padding:20px 26px 60px;max-width:1500px;}
.pager{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
.pager button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:7px;padding:6px 13px;font-family:inherit;font-size:13px;cursor:pointer;}
.pager button:disabled{opacity:0.4;cursor:default;}
.pager .pos{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);}
.pager .title{font-size:16px;font-weight:600;}
.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:9px 13px;margin-bottom:12px;}
.controls .fgroup{flex-direction:row;align-items:center;gap:8px;}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}
.tag{font-family:"IBM Plex Mono",monospace;font-size:11px;padding:3px 9px;border-radius:5px;background:var(--chip);color:var(--ink);}
.tag.acc{background:var(--accent);color:var(--accent-ink);}
.tag.P{background:var(--pass);color:#fff;}
.tag.M{background:var(--marginal);color:#fff;}
.tag.F,.tag.X{background:var(--fail);color:#fff;}
.panels{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;}
.panels.three{grid-template-columns:repeat(3,minmax(0,1fr));}
@media (max-width:1150px){.panels,.panels.three{grid-template-columns:1fr;}}
.panelbox{border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden;}
.panelbox>header{font-family:"IBM Plex Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted);border-bottom:1px solid var(--line);padding:8px 16px;display:flex;gap:8px;align-items:center;}
.panelbox>header .dot{width:8px;height:8px;border-radius:50%;background:var(--muted);}
.panelbox.styled>header .dot{background:var(--accent);}
.panelbox.base>header .dot{background:var(--marginal);}
.greeting{border-left:3px solid var(--accent);padding:2px 0 2px 12px;color:var(--muted);font-size:13px;margin:12px 16px 0;}
.reply{font-family:"Source Serif 4",Georgia,serif;font-size:15.5px;line-height:1.6;padding:4px 20px 16px;}
.reply h1,.reply h2,.reply h3{font-family:"Instrument Sans",sans-serif;font-size:14px;letter-spacing:0.01em;margin:18px 0 6px;color:var(--accent);text-transform:uppercase;font-weight:600;}
.reply pre{overflow-x:auto;background:var(--ground);border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:13px;}
.reply code{font-family:"IBM Plex Mono",monospace;font-size:0.88em;}
.reply .empty{color:var(--muted);font-family:"Instrument Sans",sans-serif;font-size:13.5px;padding-top:12px;}
.fb{margin-top:20px;border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:10px;max-width:860px;}
.fb .head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.fb .head b{font-size:14px;}
.rate{display:flex;gap:5px;}
.rate button{border:1px solid var(--line);background:var(--panel);border-radius:7px;padding:4px 12px;font-size:13px;cursor:pointer;color:var(--ink);font-family:inherit;}
.rate button.on{background:var(--chip-on);color:var(--chip-on-ink);border-color:var(--chip-on);}
textarea{width:100%;box-sizing:border-box;min-height:84px;background:var(--ground);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;font-family:inherit;font-size:14px;resize:vertical;}
.fbrow{display:flex;align-items:center;gap:12px;}
.fbrow button{background:var(--accent);color:var(--accent-ink);border:none;border-radius:7px;padding:7px 18px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.fbstate{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted);}
.offline{background:var(--chip);border:1px solid var(--line);border-radius:8px;padding:9px 13px;font-size:13px;color:var(--muted);}
.donechip{margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--muted);}
:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
[hidden]{display:none!important;}
</style>
<div class="app">
  <aside class="rail">
    <div>
      <h1>Mouthfeel <span>Voice Lab</span></h1>
      <div class="sub">Original vs styled, side by side. ←/→ pages voices, 1–3 sets intensity.</div>
    </div>
    <div class="fgroup"><label>Profile</label><select id="profileSel"></select></div>
    <div class="fgroup"><label>Case</label><select id="caseSel"></select></div>
    <div class="fgroup" id="deltaGroup" hidden><label>Vs baseline</label><div class="chips" id="deltaChips"></div></div>
    <div class="count" id="count"></div>
    <div class="offline" id="dbNote" hidden>Feedback storage isn't reachable in this view — notes won't save. Open the artifact signed in on claude.ai.</div>
  </aside>
  <main class="main">
    <div class="pager">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <span class="title" id="pairTitle"></span>
      <span class="pos" id="pos"></span>
      <span class="donechip" id="fbCount"></span>
    </div>
    <div class="controls">
      <div class="fgroup"><label>Arm</label><div class="chips" id="armChips"></div></div>
      <div class="fgroup"><label>Intensity</label><div class="chips" id="intChips"></div></div>
      <div class="fgroup" id="runGroup" hidden><label>Run</label><div class="chips" id="runChips"></div></div>
    </div>
    <div class="meta" id="meta"></div>
    <div class="panels" id="panels">
      <div class="panelbox">
        <header><span class="dot"></span><span>Original · Mouthfeel off</span></header>
        <article class="reply" id="origReply"></article>
      </div>
      <div class="panelbox styled">
        <header><span class="dot"></span><span id="styledLabel">Styled</span></header>
        <div class="greeting" id="greeting" hidden></div>
        <article class="reply" id="styledReply"></article>
      </div>
      <div class="panelbox base" id="basePanel" hidden>
        <header><span class="dot"></span><span id="baseLabel">Baseline</span></header>
        <article class="reply" id="baseReply"></article>
      </div>
    </div>
    <section class="fb" id="fbSection">
      <div class="head"><b>Your feedback on the styled output</b>
        <div class="rate" id="rate">
          <button data-r="good">👍 good</button><button data-r="meh">😐 meh</button><button data-r="bad">👎 off</button>
        </div>
      </div>
      <textarea id="fbText" placeholder="What works, what's off — tone, density, accuracy, anything."></textarea>
      <div class="fbrow"><button id="save">Save feedback</button><span class="fbstate" id="fbState"></span></div>
    </section>
  </main>
</div>
<script id="data" type="application/json">${dataJson}</script>
<script>
const PAYLOAD = JSON.parse(document.getElementById("data").textContent);
const BASELINE_NAME = PAYLOAD.baselineName || "";
const armLabel = (e) => e.host === "codex" ? "codex · " + e.model : "claude · " + e.model;
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
const state = { pairIdx: 0, arm: arms.find(a => a.includes("sonnet")) || arms[0], intensity: 2, run: 1, delta: "all" };
let db = null, fbCache = {}, current = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function cellsFor(pair){
  return ITEMS.filter(e => e.profile === pair.profile && e.caseId === pair.caseId);
}
function pairChanged(pair){
  return cellsFor(pair).some(changed);
}
function visiblePairs(){
  return state.delta === "all" ? pairs : pairs.filter(pairChanged);
}
function cellOf(pair){
  const runs = cellsFor(pair).filter(e => armLabel(e) === state.arm && e.intensity === state.intensity);
  return runs.find(e => e.run === state.run) || runs[0];
}
function chipRow(el, values, key, labels){
  el.innerHTML = "";
  values.forEach((v, i) => {
    const b = document.createElement("button");
    b.className = "chip" + (String(state[key]) === String(v) ? " on" : "");
    b.textContent = labels ? labels[i] : v;
    b.onclick = () => { state[key] = v; if (key !== "run") state.run = 1; render(); };
    el.appendChild(b);
  });
}
function selRow(el, values, selected, onpick){
  el.innerHTML = "";
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
  el.value = selected;
  el.onchange = () => onpick(el.value);
}
function renderReply(el, markdown){
  el.innerHTML = markdown === undefined
    ? '<p class="empty">No output for this combination.</p>'
    : DOMPurify.sanitize(marked.parse(markdown));
}
function render(){
  const list = visiblePairs();
  if (state.pairIdx >= list.length) state.pairIdx = Math.max(0, list.length - 1);
  const pair = list[state.pairIdx];
  $("count").textContent = list.length + " of " + pairs.length + " voices shown";
  $("prev").disabled = state.pairIdx <= 0;
  $("next").disabled = state.pairIdx >= list.length - 1;
  $("pos").textContent = list.length ? (state.pairIdx + 1) + " / " + list.length : "0 / 0";
  if (!pair) {
    $("pairTitle").textContent = "";
    current = null;
    renderReply($("origReply"), undefined);
    renderReply($("styledReply"), undefined);
    $("basePanel").hidden = true;
    return;
  }
  selRow($("profileSel"), profiles, pair.profile, (v) => {
    const idx = visiblePairs().findIndex(pr => pr.profile === v);
    if (idx >= 0) { state.pairIdx = idx; state.run = 1; render(); }
  });
  selRow($("caseSel"), cases, pair.caseId, (v) => {
    const idx = visiblePairs().findIndex(pr => pr.profile === pair.profile && pr.caseId === v)
      ?? -1;
    state.pairIdx = idx >= 0 ? idx : 0; state.run = 1; render();
  });
  if (BASELINE_NAME) {
    $("deltaGroup").hidden = false;
    chipRow($("deltaChips"), ["all", "changed"], "delta");
  }
  $("pairTitle").textContent = pair.profile;
  chipRow($("armChips"), arms, "arm");
  chipRow($("intChips"), [1, 2, 3], "intensity");
  const e = cellOf(pair);
  current = e || null;
  const runs = e ? cellsFor(pair).filter(x => armLabel(x) === state.arm && x.intensity === e.intensity).map(x => x.run) : [];
  $("runGroup").hidden = runs.length <= 1;
  if (runs.length > 1) chipRow($("runChips"), runs, "run");
  const baselineTag = !BASELINE_NAME || !e ? "" : e.baseline === undefined
    ? '<span class="tag">no baseline cell</span>'
    : changed(e)
      ? '<span class="tag M">vs ' + esc(BASELINE_NAME) + ": changed</span>"
      : '<span class="tag P">vs ' + esc(BASELINE_NAME) + ": same</span>";
  $("meta").innerHTML = !e ? "" :
    '<span class="tag acc">' + esc(e.profile) + " " + e.intensity + "</span>" +
    '<span class="tag">' + esc(armLabel(e)) + "</span>" +
    '<span class="tag">' + esc(e.caseId) + "</span>" +
    (e.verdict ? '<span class="tag ' + e.verdict + '">claude: ' + esc(e.verdict) + "</span>" : "") +
    baselineTag;
  renderReply($("origReply"), originals.get(state.arm + "|" + pair.caseId));
  $("styledLabel").textContent = "Styled · " + pair.profile + " " + state.intensity + " · " + state.arm;
  if (e && e.greeting && e.host !== "pi") { $("greeting").hidden = false; $("greeting").textContent = e.greeting.trim(); }
  else $("greeting").hidden = true;
  renderReply($("styledReply"), e ? e.reply : undefined);
  const showBase = changed(e);
  $("basePanel").hidden = !showBase;
  $("panels").classList.toggle("three", showBase);
  if (showBase) {
    $("baseLabel").textContent = "Baseline · " + BASELINE_NAME;
    renderReply($("baseReply"), e.baseline);
  }
  $("fbSection").hidden = !e;
  if (e) loadFeedback(e.key);
}
function setRate(r){
  for (const b of $("rate").querySelectorAll("button")) b.classList.toggle("on", b.dataset.r === r);
}
function currentRate(){
  const on = $("rate").querySelector("button.on");
  return on ? on.dataset.r : "";
}
async function loadFeedback(key){
  setRate(""); $("fbText").value = ""; $("fbState").textContent = "";
  const cached = fbCache[key];
  if (cached) { setRate(cached.rating || ""); $("fbText").value = cached.text || ""; $("fbState").textContent = "saved earlier"; }
  if (!db || cached) return;
  try {
    const snap = await db.doc("feedback/" + key).get();
    const body = snap && snap.exists ? snap.data() : null;
    if (body && current && current.key === key) {
      fbCache[key] = body;
      setRate(body.rating || ""); $("fbText").value = body.text || "";
      $("fbState").textContent = "saved earlier";
    }
  } catch {}
}
async function save(){
  if (!current) return;
  const payload = { text: $("fbText").value, rating: currentRate(), profile: current.profile, intensity: current.intensity, arm: armLabel(current), caseId: current.caseId, run: current.run, updatedAt: new Date().toISOString() };
  if (!db) { $("fbState").textContent = "storage unavailable — copy your note elsewhere"; return; }
  $("fbState").textContent = "saving…";
  try {
    await db.doc("feedback/" + current.key).set(payload);
    fbCache[current.key] = payload;
    $("fbState").textContent = "saved ✓";
    refreshCount();
  } catch (err) {
    $("fbState").textContent = "save failed (" + (err && err.code ? err.code : "error") + ") — try again";
  }
}
async function refreshCount(){
  if (!db) return;
  try {
    const rows = await db.collection("feedback").limit(1000).get();
    $("fbCount").textContent = rows.docs.length + " notes saved";
  } catch {}
}
for (const b of $("rate").querySelectorAll("button")) b.onclick = () => { setRate(b.dataset.r === currentRate() ? "" : b.dataset.r); };
$("save").onclick = save;
$("prev").onclick = () => { state.pairIdx--; state.run = 1; render(); };
$("next").onclick = () => { state.pairIdx++; state.run = 1; render(); };
document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "TEXTAREA" || ev.target.tagName === "SELECT") return;
  if (ev.key === "ArrowLeft" && !$("prev").disabled) { state.pairIdx--; state.run = 1; render(); }
  if (ev.key === "ArrowRight" && !$("next").disabled) { state.pairIdx++; state.run = 1; render(); }
  if (["1", "2", "3"].includes(ev.key)) { state.intensity = Number(ev.key); state.run = 1; render(); }
});
render();
claude.use("db").then((ns) => {
  db = ns;
  if (!db) { $("dbNote").hidden = false; return; }
  refreshCount();
  if (current) loadFeedback(current.key);
});
</script>
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verdictsArg = args.find((a) => a.startsWith("--verdicts="));
  const baselineArg = args.find((a) => a.startsWith("--baseline="));
  const runDirs = args.filter((a) => !a.startsWith("--"));
  if (runDirs.length === 0) {
    console.error(
      "usage: tsx harness/review-page.ts [--verdicts=<file>] [--baseline=<name>] <run-dir-name...> (names under evals/runs/host-smoke/)",
    );
    process.exitCode = 1;
    return;
  }
  const entries: PageEntry[] = await collect(runDirs);
  const verdictsFile = verdictsArg ? verdictsArg.slice("--verdicts=".length) : "SWEEP-2026-09-04-verdicts.md";
  try {
    applyVerdicts(entries, await readFile(join(artifactRoot, verdictsFile), "utf8"));
  } catch {
    console.warn(`verdicts table ${verdictsFile} not found; page renders without claude verdicts`);
  }
  let baselineName = "";
  if (baselineArg) {
    baselineName = baselineArg.slice("--baseline=".length);
    const rows = (await readFile(baselinePath(baselineName), "utf8"))
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as BaselineRow);
    const byCell = new Map(rows.map((r) => [r.cell, r.reply]));
    for (const entry of entries) {
      const reply = byCell.get(cellKey(entry));
      if (reply !== undefined) entry.baseline = reply;
    }
  }
  const out = join(artifactRoot, "review.html");
  const dataJson = JSON.stringify({ baselineName, entries }).replaceAll("<", "\\u003c");
  await writeFile(out, pageTemplate(dataJson));
  console.log(
    `wrote ${out} with ${entries.length} entries${baselineName ? ` against baseline ${baselineName}` : ""}`,
  );
}

await main();
