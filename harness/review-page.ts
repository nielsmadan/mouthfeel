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

const pageTemplate = (dataJson: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mouthfeel Voice Lab</title>
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
  :root{
    --ground:#171512;--panel:#1F1C18;--ink:#EAE5DE;--muted:#9A9288;--line:#37322B;
    --accent:#D97757;--accent-ink:#1B140F;
    --pass:#6FB383;--marginal:#D2A24C;--fail:#D97764;
    --chip:#2A2721;--chip-on:#EAE5DE;--chip-on-ink:#171512;
  }
}
*{box-sizing:border-box;}
body{margin:0;background:var(--ground);color:var(--ink);font-family:"Instrument Sans",system-ui,sans-serif;font-size:15px;line-height:1.5;}
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh;}
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
.main{padding:20px 24px 60px;}
.pager{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
.pager button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:7px;padding:6px 13px;font-family:inherit;font-size:13px;cursor:pointer;}
.pager button:disabled{opacity:0.4;cursor:default;}
.pager .pos{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);}
.pager .title{font-size:16px;font-weight:600;}
.controls{display:flex;gap:18px;flex-wrap:wrap;align-items:center;border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:9px 13px;margin-bottom:14px;}
.controls .fgroup{flex-direction:row;align-items:center;gap:8px;}
.tag{font-family:"IBM Plex Mono",monospace;font-size:10.5px;padding:2px 8px;border-radius:5px;background:var(--chip);color:var(--ink);}
.tag.P{background:var(--pass);color:#fff;}
.tag.M{background:var(--marginal);color:#fff;}
.tag.F,.tag.X{background:var(--fail);color:#fff;}
.panels{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr));align-items:start;}
@media (max-width:1500px){.panels{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media (max-width:820px){.panels{grid-template-columns:1fr;}}
.panelbox{border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden;display:flex;flex-direction:column;}
.panelbox>header{font-family:"IBM Plex Mono",monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);border-bottom:1px solid var(--line);padding:8px 14px;display:flex;gap:7px;align-items:center;flex-wrap:wrap;}
.panelbox>header .dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none;}
.panelbox.styled>header .dot{background:var(--accent);}
.blbtn{border:1px solid var(--line);background:var(--ground);color:var(--ink);border-radius:5px;padding:1px 7px;font-size:10.5px;cursor:pointer;font-family:inherit;margin-left:auto;}
.blbtn.on{background:var(--marginal);color:#fff;border-color:var(--marginal);}
details.greet{margin:10px 14px 0;font-size:12.5px;color:var(--muted);}
details.greet summary{cursor:pointer;font-family:"IBM Plex Mono",monospace;font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;}
details.greet p{border-left:3px solid var(--accent);padding-left:10px;margin:6px 0 0;}
.reply{font-family:"Source Serif 4",Georgia,serif;font-size:14.5px;line-height:1.58;padding:2px 16px 12px;}
.reply h1,.reply h2,.reply h3{font-family:"Instrument Sans",sans-serif;font-size:12.5px;letter-spacing:0.01em;margin:16px 0 5px;color:var(--accent);text-transform:uppercase;font-weight:600;}
.reply pre{overflow-x:auto;background:var(--ground);border:1px solid var(--line);border-radius:7px;padding:8px 10px;font-size:12px;}
.reply code{font-family:"IBM Plex Mono",monospace;font-size:0.88em;}
.reply .empty{color:var(--muted);font-family:"Instrument Sans",sans-serif;font-size:13px;padding-top:10px;}
.fb{border-top:1px solid var(--line);padding:10px 14px 12px;display:flex;flex-direction:column;gap:7px;margin-top:auto;}
.rate{display:flex;gap:4px;align-items:center;}
.rate button{border:1px solid var(--line);background:var(--ground);border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer;color:var(--ink);font-family:inherit;}
.rate button.on{background:var(--chip-on);color:var(--chip-on-ink);border-color:var(--chip-on);}
.fb textarea{width:100%;min-height:44px;background:var(--ground);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:7px 9px;font-family:inherit;font-size:13px;resize:vertical;}
.fbrow{display:flex;align-items:center;gap:9px;}
.fbrow button{background:var(--accent);color:var(--accent-ink);border:none;border-radius:6px;padding:4px 13px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.fbstate{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--muted);}
.offline{background:var(--chip);border:1px solid var(--line);border-radius:8px;padding:9px 13px;font-size:13px;color:var(--muted);}
:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
[hidden]{display:none!important;}
</style>
</head>
<body>
<div class="app">
  <aside class="rail">
    <div>
      <h1>Mouthfeel <span>Voice Lab</span></h1>
      <div class="sub">Original next to every intensity. ←/→ pages voices.</div>
    </div>
    <div class="fgroup"><label>Profile</label><select id="profileSel"></select></div>
    <div class="fgroup"><label>Case</label><select id="caseSel"></select></div>
    <div class="fgroup" id="deltaGroup" hidden><label>Vs baseline</label><div class="chips" id="deltaChips"></div></div>
    <div class="count" id="count"></div>
    <div class="count" id="fbCount"></div>
    <div class="offline" id="apiNote" hidden>Feedback needs the local server — run <code>npm run eval:serve</code> and open the printed URL.</div>
  </aside>
  <main class="main">
    <div class="pager">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <span class="title" id="pairTitle"></span>
      <span class="pos" id="pos"></span>
    </div>
    <div class="controls">
      <div class="fgroup"><label>Arm</label><div class="chips" id="armChips"></div></div>
      <div class="fgroup" id="runGroup" hidden><label>Run</label><div class="chips" id="runChips"></div></div>
    </div>
    <div class="panels" id="panels"></div>
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
const state = { pairIdx: 0, arm: arms.find(a => a.includes("sonnet")) || arms[0], run: 1, delta: "all" };
const showBaselineFor = new Set();
let feedback = {}, apiOk = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function cellsFor(pair){
  return ITEMS.filter(e => e.profile === pair.profile && e.caseId === pair.caseId);
}
function pairChanged(pair){
  return cellsFor(pair).some(changed);
}
function visiblePairs(){
  return state.delta === "all" ? pairs : pairs.filter(pairChanged);
}
function cellAt(pair, intensity){
  const runs = cellsFor(pair).filter(e => armLabel(e) === state.arm && e.intensity === intensity);
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
function panelHtml(e, intensity, pair){
  const showBase = e && changed(e) && showBaselineFor.has(e.key);
  const verdictTag = e && e.verdict ? '<span class="tag ' + esc(e.verdict) + '">' + esc(e.verdict) + "</span>" : "";
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
  return '<div class="panelbox styled"><header><span class="dot"></span><span>' +
    esc(pair.profile) + " " + intensity + (showBase ? " · baseline" : "") + "</span>" +
    verdictTag + changeTag + blButton + "</header>" + greet +
    '<article class="reply">' + replyHtml(e ? (showBase ? e.baseline : e.reply) : undefined) + "</article>" + fb + "</div>";
}
function feedbackHtml(e){
  const saved = feedback[e.key] || {};
  const rateBtn = (r, label) =>
    '<button data-rate="' + r + '" data-key="' + esc(e.key) + '"' + (saved.rating === r ? ' class="on"' : "") + ">" + label + "</button>";
  return '<div class="fb"><div class="rate">' +
    rateBtn("good", "👍") + rateBtn("meh", "😐") + rateBtn("bad", "👎") +
    '</div><textarea data-text="' + esc(e.key) + '" placeholder="Notes on this output…">' + esc(saved.text || "") + "</textarea>" +
    '<div class="fbrow"><button data-save="' + esc(e.key) + '">Save</button><span class="fbstate" data-state="' + esc(e.key) + '">' +
    (saved.updatedAt ? "saved earlier" : "") + "</span></div></div>";
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
    if (idx >= 0) { state.pairIdx = idx; state.run = 1; render(); }
  });
  selRow($("caseSel"), cases, pair.caseId, (v) => {
    const vis = visiblePairs();
    // Prefer the same voice in the picked case; else the first voice that has it.
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
  chipRow($("armChips"), arms, "arm");
  const cells = [1, 2, 3].map(i => cellAt(pair, i));
  const runValues = [...new Set(cellsFor(pair).filter(e => armLabel(e) === state.arm).map(e => e.run))].sort();
  $("runGroup").hidden = runValues.length <= 1;
  if (runValues.length > 1) chipRow($("runChips"), runValues, "run");
  $("panels").innerHTML =
    '<div class="panelbox"><header><span class="dot"></span><span>Original · Mouthfeel off · ' + esc(state.arm) + "</span></header>" +
    '<article class="reply">' + replyHtml(originals.get(state.arm + "|" + pair.caseId)) + "</article></div>" +
    cells.map((e, i) => panelHtml(e, i + 1, pair)).join("");
  wirePanels();
}
function wirePanels(){
  for (const b of $("panels").querySelectorAll("[data-bl]")) {
    b.onclick = () => {
      const k = b.dataset.bl;
      if (showBaselineFor.has(k)) showBaselineFor.delete(k); else showBaselineFor.add(k);
      render();
    };
  }
  for (const b of $("panels").querySelectorAll("[data-rate]")) {
    b.onclick = () => {
      const group = b.closest(".rate");
      const on = b.classList.contains("on");
      for (const x of group.querySelectorAll("button")) x.classList.remove("on");
      if (!on) b.classList.add("on");
    };
  }
  for (const b of $("panels").querySelectorAll("[data-save]")) {
    b.onclick = () => saveFeedback(b.dataset.save);
  }
}
function entryByKey(key){
  return ITEMS.find(e => e.key === key);
}
async function saveFeedback(key){
  const e = entryByKey(key);
  const box = $("panels").querySelector('[data-text="' + CSS.escape(key) + '"]');
  const stateEl = $("panels").querySelector('[data-state="' + CSS.escape(key) + '"]');
  const rated = $("panels").querySelector('[data-key="' + CSS.escape(key) + '"].on');
  if (!e || !box || !stateEl) return;
  if (!apiOk) { stateEl.textContent = "no server — run npm run eval:serve"; return; }
  const payload = {
    key,
    text: box.value,
    rating: rated ? rated.dataset.rate : "",
    profile: e.profile, intensity: e.intensity, arm: armLabel(e), caseId: e.caseId, run: e.run,
    updatedAt: new Date().toISOString(),
  };
  stateEl.textContent = "saving…";
  try {
    const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(String(res.status));
    feedback[key] = payload;
    stateEl.textContent = "saved ✓";
    refreshCount();
  } catch {
    stateEl.textContent = "save failed — is the server still running?";
  }
}
function refreshCount(){
  const n = Object.keys(feedback).length;
  $("fbCount").textContent = n ? n + " notes saved" : "";
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
</script>
</body>
</html>
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
