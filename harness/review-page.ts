import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { INTENSITIES } from "../src/core/types.js";
import { BASELINE_SCALE, baselinePath, type BaselineRow } from "./baseline.js";
import { cellKey, collect, type Entry } from "./collect.js";
import { artifactRoot, claudeNotesFile } from "./config.js";

const assetDir = dirname(fileURLToPath(import.meta.url));

type PageEntry = Entry & { baseline?: string; note?: string; noteAt?: string };

// Notes are either bare strings (legacy, no staleness tracking) or
// { note, notedAt } objects; notedAt lets the page demote takes on re-run.
export function applyNotes(
  entries: Array<{ key: string; note?: string; noteAt?: string }>,
  notes: Record<string, unknown>,
): number {
  let attached = 0;
  for (const entry of entries) {
    const value = notes[entry.key];
    let note: string | undefined;
    let noteAt: string | undefined;
    if (typeof value === "string") {
      note = value;
    } else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row["note"] === "string") note = row["note"];
      if (typeof row["notedAt"] === "string") noteAt = row["notedAt"];
    }
    if (note !== undefined && note.trim() !== "") {
      entry.note = note.trim();
      if (noteAt !== undefined) entry.noteAt = noteAt;
      attached++;
    }
  }
  return attached;
}

export const pageTemplate = (dataJson: string, css: string, script: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mouthfeel Voice Lab</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.5/purify.min.js"></script>
<style>
${css}</style>
</head>
<body>
<div class="app">
  <aside class="rail">
    <div>
      <h1>Mouthfeel <span>Voice Lab</span></h1>
      <div class="sub">Original beside every arm and intensity. ←/→ pages voices.</div>
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
      <div class="fgroup"><label>View</label><div class="chips" id="viewChips"></div></div>
      <div class="fgroup" id="armGroup"><label>Arm</label><div class="chips" id="armChips"></div></div>
      <div class="fgroup" id="runGroup" hidden><label>Run</label><div class="chips" id="runChips"></div></div>
    </div>
    <div class="panels" id="panels"></div>
  </main>
</div>
<script id="data" type="application/json">${dataJson}</script>
<script type="module">
${script}</script>
</body>
</html>
`;

export async function loadPageScript(): Promise<string> {
  const logic = await readFile(join(assetDir, "review-logic.mjs"), "utf8");
  const client = await readFile(join(assetDir, "review-page.client.js"), "utf8");
  return `${logic.replaceAll(/^export /gm, "")}\n${client}`;
}

export function payloadJson(payload: unknown): string {
  return JSON.stringify(payload).replaceAll("<", "\\u003c");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const baselineArg = args.find((a) => a.startsWith("--baseline="));
  const notesArg = args.find((a) => a.startsWith("--notes="));
  const runDirs = args.filter((a) => !a.startsWith("--"));
  if (runDirs.length === 0) {
    console.error(
      "usage: tsx harness/review-page.ts [--baseline=<name>] [--notes=<file>] <run-dir-name...> (names under evals/runs/host-smoke/)",
    );
    process.exitCode = 1;
    return;
  }
  const entries: PageEntry[] = await collect(runDirs);
  const notesFile = notesArg ? notesArg.slice("--notes=".length) : claudeNotesFile;
  try {
    const attached = applyNotes(entries, JSON.parse(await readFile(notesFile, "utf8")) as Record<string, unknown>);
    console.log(`attached ${attached} Claude notes from ${notesFile}`);
  } catch {
    console.warn(`notes file ${notesFile} not found; page renders without Claude's takes`);
  }
  let baselineName = "";
  if (baselineArg) {
    baselineName = baselineArg.slice("--baseline=".length);
    const rows = (await readFile(baselinePath(baselineName), "utf8"))
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as BaselineRow);
    const wrongScale = rows.find((r) => r.scale !== BASELINE_SCALE);
    if (wrongScale) {
      throw new Error(
        `baseline ${baselineName} is not on intensity scale ${BASELINE_SCALE}; comparing across scales would join different levels`,
      );
    }
    const byCell = new Map(rows.map((r) => [r.cell, r.reply]));
    for (const entry of entries) {
      const reply = byCell.get(cellKey(entry));
      if (reply !== undefined) entry.baseline = reply;
    }
  }
  const out = join(artifactRoot, "review.html");
  const dataJson = payloadJson({ baselineName, intensities: INTENSITIES, entries });
  const css = await readFile(join(assetDir, "review-page.css"), "utf8");
  await writeFile(out, pageTemplate(dataJson, css, await loadPageScript()));
  console.log(
    `wrote ${out} with ${entries.length} entries${baselineName ? ` against baseline ${baselineName}` : ""}`,
  );
}

if (process.argv[1]?.endsWith("review-page.ts")) await main();
