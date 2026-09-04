import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { artifactRoot } from "./config.js";

interface Entry {
  key: string;
  host: string;
  model: string;
  profile: string;
  intensity: number;
  caseId: string;
  run: number;
  verdict: string;
  reply: string;
  greeting: string;
}

async function collect(runDirs: string[]): Promise<Entry[]> {
  const entries: Entry[] = [];
  for (const runDir of runDirs) {
    const jobs = (await readdir(join(artifactRoot, runDir), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== "shims" && e.name !== "workspace")
      .map((e) => e.name);
    for (const job of jobs) {
      const dir = join(artifactRoot, runDir, job);
      let meta: Record<string, unknown>;
      let reply: string;
      try {
        meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
        reply = await readFile(join(dir, "reply.md"), "utf8");
      } catch {
        continue;
      }
      let greeting = "";
      try {
        greeting = await readFile(join(dir, "greeting.md"), "utf8");
      } catch {
        // pane-scraped hosts may lack a clean greeting; optional
      }
      const host = String(meta["host"]);
      const model = String(meta["model"]);
      const profile = String(meta["profile"]);
      const intensity = Number(meta["intensity"]);
      const caseId = String(meta["caseId"]);
      const runMatch = job.match(/-run(\d+)$/);
      const run = runMatch ? Number(runMatch[1]) : 1;
      entries.push({
        key: [host, model, caseId, profile, intensity, run].join("_").replace(/[^A-Za-z0-9_.:@+~-]/g, "-"),
        host,
        model,
        profile,
        intensity,
        caseId,
        run,
        verdict: "",
        reply,
        greeting,
      });
    }
  }
  entries.sort((a, b) =>
    a.profile.localeCompare(b.profile) || a.intensity - b.intensity || a.model.localeCompare(b.model) || a.run - b.run,
  );
  return entries;
}

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
<style>
:root{
  --ground:#FAF9F7;--panel:#F1EEE9;--ink:#211E1A;--muted:#6E675F;--line:#DDD7CE;
  --accent:#C4633F;--accent-ink:#FFFFFF;
  --pass:#3D7A4E;--marginal:#A8781E;--fail:#A8402F;
  --chip:#E8E3DC;--chip-on:#211E1A;--chip-on-ink:#FAF9F7;
}
:root:not([data-theme="light"]){}
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
.app{display:grid;grid-template-columns:270px 1fr;min-height:100vh;}
@media (max-width:820px){.app{grid-template-columns:1fr;}}
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
.main{padding:22px 30px 60px;max-width:860px;}
.pager{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
.pager button{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:7px;padding:6px 13px;font-family:inherit;font-size:13px;cursor:pointer;}
.pager button:disabled{opacity:0.4;cursor:default;}
.pager .pos{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--muted);}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}
.tag{font-family:"IBM Plex Mono",monospace;font-size:11px;padding:3px 9px;border-radius:5px;background:var(--chip);color:var(--ink);}
.tag.acc{background:var(--accent);color:var(--accent-ink);}
.tag.P{background:var(--pass);color:#fff;}
.tag.M{background:var(--marginal);color:#fff;}
.tag.F,.tag.X{background:var(--fail);color:#fff;}
.greeting{border-left:3px solid var(--accent);padding:2px 0 2px 12px;color:var(--muted);font-size:13px;margin:12px 0;}
.reply{font-family:"Source Serif 4",Georgia,serif;font-size:16px;line-height:1.62;border:1px solid var(--line);border-radius:10px;padding:8px 26px 18px;background:var(--panel);}
.reply h1,.reply h2,.reply h3{font-family:"Instrument Sans",sans-serif;font-size:15px;letter-spacing:0.01em;margin:20px 0 6px;color:var(--accent);text-transform:uppercase;font-weight:600;}
.reply pre{overflow-x:auto;background:var(--ground);border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:13px;}
.reply code{font-family:"IBM Plex Mono",monospace;font-size:0.88em;}
.fb{margin-top:20px;border-top:1px solid var(--line);padding-top:16px;display:flex;flex-direction:column;gap:10px;}
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
</style>
<div class="app">
  <aside class="rail">
    <div>
      <h1>Mouthfeel <span>Voice Lab</span></h1>
      <div class="sub">Sweep outputs, 2026-09-04. Arrow keys page. Feedback saves for Claude to read back.</div>
    </div>
    <div class="fgroup"><label>Arm</label><div class="chips" id="armChips"></div></div>
    <div class="fgroup"><label>Intensity</label><div class="chips" id="intChips"></div></div>
    <div class="fgroup"><label>Profile</label><select id="profileSel"></select></div>
    <div class="fgroup"><label>Case</label><select id="caseSel"></select></div>
    <div class="count" id="count"></div>
    <div class="offline" id="dbNote" hidden>Feedback storage isn't reachable in this view — notes won't save. Open the artifact signed in on claude.ai.</div>
  </aside>
  <main class="main">
    <div class="pager">
      <button id="prev">← Prev</button>
      <button id="next">Next →</button>
      <span class="pos" id="pos"></span>
      <span class="donechip" id="fbCount"></span>
    </div>
    <div class="meta" id="meta"></div>
    <div class="greeting" id="greeting" hidden></div>
    <article class="reply" id="reply"></article>
    <section class="fb">
      <div class="head"><b>Your feedback</b>
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
const DATA = JSON.parse(document.getElementById("data").textContent);
const armLabel = (e) => e.host === "codex" ? "codex · " + e.model : "claude · " + e.model;
const arms = [...new Set(DATA.map(armLabel))];
const profiles = [...new Set(DATA.map(e => e.profile))];
const cases = [...new Set(DATA.map(e => e.caseId))];
const state = { arm: "all", intensity: "all", profile: "all", caseId: "all", idx: 0 };
let db = null, fbCache = {}, current = null;

const $ = (id) => document.getElementById(id);
function chipRow(el, values, key){
  el.innerHTML = "";
  for (const v of ["all", ...values]) {
    const b = document.createElement("button");
    b.className = "chip" + (String(state[key]) === String(v) ? " on" : "");
    b.textContent = v === "all" ? "all" : v;
    b.onclick = () => { state[key] = v; state.idx = 0; render(); };
    el.appendChild(b);
  }
}
function selRow(el, values, key){
  el.innerHTML = "";
  for (const v of ["all", ...values]) {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
  el.value = String(state[key]);
  el.onchange = () => { state[key] = el.value; state.idx = 0; render(); };
}
function filtered(){
  return DATA.filter(e =>
    (state.arm === "all" || armLabel(e) === state.arm) &&
    (state.intensity === "all" || String(e.intensity) === String(state.intensity)) &&
    (state.profile === "all" || e.profile === state.profile) &&
    (state.caseId === "all" || e.caseId === state.caseId));
}
function render(){
  chipRow($("armChips"), arms, "arm");
  chipRow($("intChips"), [1,2,3], "intensity");
  selRow($("profileSel"), profiles, "profile");
  selRow($("caseSel"), cases, "caseId");
  const list = filtered();
  $("count").textContent = list.length + " outputs match";
  if (state.idx >= list.length) state.idx = Math.max(0, list.length - 1);
  const e = list[state.idx];
  current = e || null;
  $("prev").disabled = state.idx <= 0;
  $("next").disabled = state.idx >= list.length - 1;
  $("pos").textContent = list.length ? (state.idx + 1) + " / " + list.length : "0 / 0";
  if (!e) { $("meta").innerHTML = ""; $("reply").innerHTML = "<p>No outputs match the filters.</p>"; $("greeting").hidden = true; return; }
  $("meta").innerHTML =
    '<span class="tag acc">' + e.profile + " " + e.intensity + "</span>" +
    '<span class="tag">' + armLabel(e) + "</span>" +
    '<span class="tag">' + e.caseId + (e.run > 1 ? " · run " + e.run : "") + "</span>" +
    (e.verdict ? '<span class="tag ' + e.verdict + '">claude: ' + e.verdict + "</span>" : "");
  if (e.greeting && e.host !== "pi") { $("greeting").hidden = false; $("greeting").textContent = e.greeting.trim(); }
  else $("greeting").hidden = true;
  $("reply").innerHTML = marked.parse(e.reply);
  loadFeedback(e.key);
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
$("prev").onclick = () => { state.idx--; render(); };
$("next").onclick = () => { state.idx++; render(); };
document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "TEXTAREA" || ev.target.tagName === "SELECT") return;
  if (ev.key === "ArrowLeft" && !$("prev").disabled) { state.idx--; render(); }
  if (ev.key === "ArrowRight" && !$("next").disabled) { state.idx++; render(); }
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
  const runDirs = process.argv.slice(2);
  if (runDirs.length === 0) {
    console.error("usage: tsx harness/review-page.ts <run-dir-name...> (names under evals/runs/host-smoke/)");
    process.exitCode = 1;
    return;
  }
  const entries = await collect(runDirs);
  try {
    const verdicts = await readFile(join(artifactRoot, "SWEEP-2026-09-04-verdicts.md"), "utf8");
    applyVerdicts(entries, verdicts);
  } catch {
    // verdicts table optional
  }
  const out = join(artifactRoot, "review.html");
  await writeFile(out, pageTemplate(JSON.stringify(entries)));
  console.log(`wrote ${out} with ${entries.length} entries`);
}

await main();
