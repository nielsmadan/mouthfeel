import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { loadProfiles } from "../src/core/load.js";
import { buildEvalJobs, loadEvalCases } from "../src/evals.js";
import { tempDirectory } from "./helpers.js";

test("builds the 108-job two-anchor intensity matrix", async () => {
  const profiles = await loadProfiles(resolve("profiles"));
  const cases = await loadEvalCases(resolve("evals", "cases"));
  assert.equal(cases.length, 6);
  assert.equal(cases.filter((candidate) => candidate.anchor).length, 2);
  const jobs = buildEvalJobs(profiles, cases);
  assert.equal(jobs.length, 108);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 108);
  assert.ok(jobs.every((job) => job.mustPreserve.length > 0));
});

test("loads the long-form architecture regression case", async () => {
  const cases = await loadEvalCases(resolve("evals", "cases"));
  const candidate = cases.find((item) => item.id === "structured-architecture");
  assert.ok(candidate);
  assert.equal(candidate.type, "long-form-explanation");
  assert.equal(candidate.anchor, false);
  assert.match(candidate.source, /## What it is/);
  assert.match(candidate.source, /## Where to read next/);
  assert.ok(candidate.mustPreserve.includes("Juggler does not run agents, replace the terminal, or manage worktrees"));
});

test("loads eval frontmatter with CRLF line endings", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-evals-");
  await writeFile(join(root, "crlf.md"), [
    "---",
    "id: crlf-case",
    "type: explanation",
    "anchor: true",
    "mustPreserve:",
    "  - Electron",
    "---",
    "Explain Electron.",
  ].join("\r\n"));
  assert.deepEqual(await loadEvalCases(root), [{
    id: "crlf-case",
    type: "explanation",
    anchor: true,
    source: "Explain Electron.",
    mustPreserve: ["Electron"],
  }]);
});

test("rejects malformed eval metadata", async (context) => {
  const anchorRoot = await tempDirectory(context, "mouthfeel-evals-anchor-");
  await writeFile(join(anchorRoot, "invalid.md"), "---\nid: invalid\ntype: test\nanchor: yes\n---\nBody\n");
  await assert.rejects(loadEvalCases(anchorRoot), /anchor must be boolean/i);

  const preserveRoot = await tempDirectory(context, "mouthfeel-evals-preserve-");
  await writeFile(join(preserveRoot, "invalid.md"), "---\nid: invalid\ntype: test\nmustPreserve:\n  - valid\n  - nested: value\n---\nBody\n");
  await assert.rejects(loadEvalCases(preserveRoot), /mustPreserve must contain only strings/i);
});
