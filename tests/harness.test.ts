import assert from "node:assert/strict";
import { describe, it } from "node:test";
import vm from "node:vm";

import {
  expandMatrix,
  jobDirName,
  parseHostCase,
  parseRunArgs,
  pickNewestVersion,
  shimScript,
  statusReplyMatches,
  workerName,
} from "../harness/lib.js";
import { codexInstallPreExec } from "../harness/hosts/codex.js";
import type { RunOptions } from "../harness/types.js";

const caseSource = `---
id: sample-case
type: long-form-explanation
profiles:
  - sailor
  - senior
intensities:
  - 2
---
Explain the tool.

Body second paragraph.`;

function baseOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  return {
    hosts: ["claude"],
    casePattern: undefined,
    profiles: undefined,
    intensities: undefined,
    model: undefined,
    effort: undefined,
    runs: 1,
    control: false,
    dryRun: false,
    keep: false,
    ...overrides,
  };
}

describe("parseHostCase", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseHostCase(caseSource, "sample.md");
    assert.equal(parsed.id, "sample-case");
    assert.equal(parsed.type, "long-form-explanation");
    assert.deepEqual(parsed.profiles, ["sailor", "senior"]);
    assert.deepEqual(parsed.intensities, [2]);
    assert.ok((parsed.turns[0] ?? "").startsWith("Explain the tool."));
    assert.ok((parsed.turns[0] ?? "").endsWith("second paragraph."));
  });

  it("rejects a file without frontmatter", () => {
    assert.throws(() => parseHostCase("just text", "bad.md"), /frontmatter/);
  });

  it("rejects intensities outside 1-2", () => {
    const source = caseSource.replace("- 2", "- 5");
    assert.throws(() => parseHostCase(source, "bad.md"), /intensities/);
  });

  it("rejects an empty body", () => {
    const source = caseSource.replace(/---\nExplain[\s\S]*$/, "---\n");
    assert.throws(() => parseHostCase(source, "bad.md"), /empty body/);
  });

  it("defaults to a single turn and no setup", () => {
    const parsed = parseHostCase(caseSource, "sample.md");
    assert.equal(parsed.setup, undefined);
    assert.equal(parsed.turns.length, 1);
  });

  it("parses a fixture setup and splits multi-turn bodies", () => {
    const source = caseSource
      .replace("id: sample-case", "id: sample-case\nsetup: tally")
      .replace("Body second paragraph.", "Body second paragraph.\n---turn---\nNow wrap up.");
    const parsed = parseHostCase(source, "sample.md");
    assert.equal(parsed.setup, "tally");
    assert.equal(parsed.turns.length, 2);
    assert.ok((parsed.turns[0] ?? "").endsWith("Body second paragraph."));
    assert.equal(parsed.turns[1], "Now wrap up.");
  });

  it("rejects a bad setup name and an empty turn", () => {
    assert.throws(
      () => parseHostCase(caseSource.replace("id: sample-case", "id: sample-case\nsetup: ../escape"), "bad.md"),
      /setup/,
    );
    assert.throws(
      () => parseHostCase(caseSource + "\n---turn---\n", "bad.md"),
      /empty body or empty turn/,
    );
  });
});

describe("expandMatrix", () => {
  const parsed = parseHostCase(caseSource, "sample.md");

  it("expands hosts x profiles x intensities from frontmatter", () => {
    const jobs = expandMatrix(baseOptions({ hosts: ["claude", "pi"] }), [parsed]);
    assert.equal(jobs.length, 4);
    assert.deepEqual(jobs[0], { host: "claude", caseId: "sample-case", profile: "sailor", intensity: 2, run: 1 });
  });

  it("applies profile and intensity overrides, including lists", () => {
    const jobs = expandMatrix(baseOptions({ profiles: ["glados"], intensities: [2] }), [parsed]);
    assert.deepEqual(jobs, [{ host: "claude", caseId: "sample-case", profile: "glados", intensity: 2, run: 1 }]);
    const sweep = expandMatrix(baseOptions({ profiles: ["glados", "sailor"], intensities: [1, 2] }), [parsed]);
    assert.equal(sweep.length, 4);
    assert.deepEqual(sweep.map((j) => `${j.profile}-${j.intensity}`), [
      "glados-1",
      "glados-2",
      "sailor-1",
      "sailor-2",
    ]);
  });

  it("filters cases by substring pattern", () => {
    assert.equal(expandMatrix(baseOptions({ casePattern: "nomatch" }), [parsed]).length, 0);
    assert.equal(expandMatrix(baseOptions({ casePattern: "sample" }), [parsed]).length, 2);
  });

  it("replicates each job --runs times with distinct dir names", () => {
    const jobs = expandMatrix(baseOptions({ profiles: ["glados"], intensities: [2], runs: 3 }), [parsed]);
    assert.equal(jobs.length, 3);
    assert.deepEqual(jobs.map((j) => j.run), [1, 2, 3]);
    assert.deepEqual(new Set(jobs.map(jobDirName)).size, 3);
  });
});

describe("naming", () => {
  it("builds job directory and worker names", () => {
    const job = { host: "codex" as const, caseId: "sample-case", profile: "sailor", intensity: 2, run: 1 };
    assert.equal(jobDirName(job), "codex-sample-case-sailor-2");
    assert.equal(workerName("mf-smoke", job, 3), "mf-smoke-codex-3");
    assert.equal(jobDirName({ ...job, run: 2 }), "codex-sample-case-sailor-2-run2");
  });
});

describe("pickNewestVersion", () => {
  it("orders numerically, not lexically", () => {
    assert.equal(pickNewestVersion(["4.0.0", "10.0.0", "9.9.9"]), "10.0.0");
  });

  it("handles missing segments", () => {
    assert.equal(pickNewestVersion(["1.4", "1.4.1", "1"]), "1.4.1");
  });

  it("returns undefined for an empty list", () => {
    assert.equal(pickNewestVersion([]), undefined);
  });
});

describe("shimScript", () => {
  it("sources zshrc then delegates with arguments", () => {
    const script = shimScript("claude");
    assert.ok(script.startsWith("#!/bin/zsh\n"));
    assert.ok(script.includes("source ~/.zshrc"));
    assert.ok(script.includes('exec claude "$@"'));
  });

  it("injects a pre-exec block before delegating", () => {
    const script = shimScript("codex", codexInstallPreExec("/dist/codex"));
    assert.ok(script.includes('CODEX_HOME'));
    assert.ok(script.includes("codex plugin add mouthfeel@mouthfeel"));
    assert.ok(script.includes("/dist/codex"));
    assert.ok(script.indexOf("plugin add") < script.indexOf('exec codex "$@"'));
  });

  it("bakes the codex reasoning effort rewrite into the shim and verifies it", () => {
    const script = shimScript("codex", codexInstallPreExec("/dist/codex", "medium"));
    assert.ok(script.includes('model_reasoning_effort = "medium"'));
    assert.ok(script.includes("exit 71"));
    assert.ok(script.indexOf("model_reasoning_effort") < script.indexOf('exec codex "$@"'));
    assert.ok(!codexInstallPreExec("/dist/codex").includes("model_reasoning_effort"));
  });
});

describe("statusReplyMatches", () => {
  it("accepts a reply naming profile and intensity", () => {
    assert.ok(statusReplyMatches("Mouthfeel: sailor, intensity 2.", "sailor", 2));
  });

  it("rejects a reply for another profile", () => {
    assert.ok(!statusReplyMatches("Mouthfeel: glados, intensity 2.", "sailor", 2));
  });
});

describe("parseRunArgs", () => {
  it("defaults to all hosts", () => {
    assert.deepEqual(parseRunArgs([]).hosts, ["claude", "codex", "pi"]);
  });

  it("parses a full flag set", () => {
    const options = parseRunArgs([
      "--host",
      "claude,pi",
      "--case",
      "structured",
      "--profile",
      "sailor,glados",
      "--intensity",
      "1,2",
      "--model",
      "haiku",
      "--dry-run",
      "--keep",
    ]);
    assert.deepEqual(options.hosts, ["claude", "pi"]);
    assert.equal(options.casePattern, "structured");
    assert.deepEqual(options.profiles, ["sailor", "glados"]);
    assert.deepEqual(options.intensities, [1, 2]);
    assert.equal(options.model, "haiku");
    assert.equal(options.dryRun, true);
    assert.equal(options.keep, true);
  });

  it("rejects unknown hosts and bad intensities", () => {
    assert.throws(() => parseRunArgs(["--host", "gemini"]), /unknown host/);
    assert.throws(() => parseRunArgs(["--intensity", "3"]), /--intensity/);
    assert.throws(() => parseRunArgs(["--intensity", "4"]), /--intensity/);
    assert.throws(() => parseRunArgs(["--intensity", "2,4"]), /--intensity/);
  });

  it("parses and validates --effort", () => {
    assert.equal(parseRunArgs(["--effort", "medium"]).effort, "medium");
    assert.equal(parseRunArgs([]).effort, undefined);
    assert.throws(() => parseRunArgs(["--effort", "max"]), /--effort/);
  });
});

describe("pane status assertion", () => {
  it("requires a second Mouthfeel line beyond the activation echo", async () => {
    const { statusPaneMatches, shellQuote } = await import("../harness/lib.js");
    const activationOnly = "❯ /mouthfeel sailor 2\n Mouthfeel: sailor, intensity 2. This applies to future replies.";
    assert.equal(statusPaneMatches(activationOnly, "sailor", 2), false);
    assert.equal(statusPaneMatches(activationOnly + "\n Mouthfeel: sailor, intensity 2.", "sailor", 2), true);
    assert.equal(shellQuote("/My Repos/d'ist"), "'/My Repos/d'\\''ist'");
  });
});

describe("baseline", () => {
  it("builds stable cell keys independent of run", async () => {
    const { cellKey } = await import("../harness/collect.js");
    const cell = { host: "claude", model: "sonnet", caseId: "structured-architecture", profile: "glados", intensity: 1 };
    assert.equal(cellKey(cell), "claude_sonnet_structured-architecture_glados_1");
    assert.equal(cellKey({ ...cell, model: "gpt-5.6-sol" }), "claude_gpt-5.6-sol_structured-architecture_glados_1");
  });

  it("rejects unsafe baseline names", async () => {
    const { baselinePath } = await import("../harness/baseline.js");
    assert.throws(() => baselinePath("../escape"), /baseline name/);
    assert.ok(baselinePath("sweep-2026-09-04").endsWith("sweep-2026-09-04.jsonl"));
  });
});

describe("control jobs", () => {
  it("expands one control job per host and case, ignoring profile lists", () => {
    const parsed = parseHostCase(caseSource, "sample.md");
    const jobs = expandMatrix(baseOptions({ hosts: ["claude", "codex"], control: true, profiles: ["glados"] }), [parsed]);
    assert.deepEqual(jobs, [
      { host: "claude", caseId: "sample-case", profile: "control", intensity: 0, run: 1 },
      { host: "codex", caseId: "sample-case", profile: "control", intensity: 0, run: 1 },
    ]);
  });

  it("parses the --control flag", () => {
    assert.equal(parseRunArgs(["--control"]).control, true);
    assert.equal(parseRunArgs([]).control, false);
  });
});

describe("claude notes", () => {
  it("attaches trimmed notes by key and ignores unknown, empty, or non-string ones", async () => {
    const { applyNotes } = await import("../harness/review-page.js");
    const entries: Array<{ key: string; note?: string }> = [{ key: "a_1" }, { key: "b_1" }, { key: "c_1" }];
    const attached = applyNotes(entries, { a_1: "  solid voice  ", b_1: "", c_1: 42, unknown: "x" });
    assert.equal(attached, 1);
    assert.equal(entries[0]?.note, "solid voice");
    assert.equal(entries[1]?.note, undefined);
    assert.equal(entries[2]?.note, undefined);
  });
});

describe("collect", () => {
  it("keys entries by cell, folds effort into the model, and prefers the newest run", async (context) => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { collect } = await import("../harness/collect.js");
    const { tempDirectory } = await import("./helpers.js");
    const base = await tempDirectory(context, "mouthfeel-collect-");

    const writeJob = async (runDir: string, job: string, meta: Record<string, unknown>, reply: string) => {
      const dir = join(base, runDir, job);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "meta.json"), JSON.stringify(meta));
      await writeFile(join(dir, "reply.md"), reply);
    };
    const meta = { host: "codex", caseId: "case", profile: "sailor", intensity: 1, model: "sol" };
    await writeJob("old", "codex-case-sailor-1", { ...meta, ranAt: "2026-09-08T00:00:00Z" }, "newer");
    await writeJob("new", "codex-case-sailor-1", { ...meta, ranAt: "2026-09-07T00:00:00Z" }, "older");
    await writeJob("old", "codex-case-sailor-1-run2", { ...meta, effort: "medium", ranAt: "2026-09-08T00:00:00Z" }, "medium");

    const entries = await collect(["old", "new"], base);
    assert.deepEqual(
      entries.map((e) => [e.key, e.reply, e.ranAt]),
      [
        ["codex_sol_case_sailor_1_1", "newer", "2026-09-08T00:00:00Z"],
        ["codex_sol@medium_case_sailor_1_2", "medium", "2026-09-08T00:00:00Z"],
      ],
    );
  });
});

describe("feedback merge", () => {
  it("upserts by key and rejects rows without one", async () => {
    const { mergeFeedback } = await import("../harness/serve.js");
    const merged = mergeFeedback({ a: { key: "a", text: "old" } }, { key: "a", text: "new", rating: "good" });
    assert.deepEqual(merged["a"], { key: "a", text: "new", rating: "good" });
    assert.throws(() => mergeFeedback({}, { text: "no key" }), /needs a key/);
    assert.throws(() => mergeFeedback({}, "nope"), /must be an object/);
  });

  it("owns the history archive server-side", async () => {
    const { mergeFeedback } = await import("../harness/serve.js");
    const existing = { a: { key: "a", text: "old", rating: "bad", history: [{ key: "a", text: "oldest" }] } };

    const archived = mergeFeedback(existing, { key: "a", text: "new", rating: "good", archivePrevious: true });
    assert.deepEqual(archived["a"], {
      key: "a",
      text: "new",
      rating: "good",
      history: [{ key: "a", text: "oldest" }, { key: "a", text: "old", rating: "bad" }],
    });

    // A stale client cannot rewrite the archive: its history payload is ignored
    // and the stored history is carried forward.
    const clobbered = mergeFeedback(existing, { key: "a", text: "stale tab", history: [] });
    assert.deepEqual(clobbered["a"], { key: "a", text: "stale tab", history: [{ key: "a", text: "oldest" }] });
  });
});

describe("review logic", () => {
  it("classifies feedback as stale only when it predates the current reply", async () => {
    const { feedbackParts } = await import("../harness/review-logic.mjs");
    const saved = { key: "a", text: "note", rating: "good", updatedAt: "2026-09-07T10:00:00Z" };

    const current = feedbackParts(saved, "2026-09-06T10:00:00Z");
    assert.equal(current.stale, false);
    assert.deepEqual(current.current, saved);
    assert.deepEqual(current.past, []);

    const stale = feedbackParts(saved, "2026-09-08T10:00:00Z");
    assert.equal(stale.stale, true);
    assert.deepEqual(stale.current, {});
    assert.deepEqual(stale.past, [saved]);

    assert.equal(feedbackParts(undefined, "2026-09-08T10:00:00Z").stale, false);
    assert.equal(feedbackParts({ key: "a", text: "", rating: "", updatedAt: "2026-01-01T00:00:00Z" }, "2026-09-08T10:00:00Z").stale, false);
  });

  it("renders history before the stale row and strips nested history", async () => {
    const { feedbackParts, stripHistory } = await import("../harness/review-logic.mjs");
    const saved = {
      key: "a",
      text: "second",
      updatedAt: "2026-09-07T10:00:00Z",
      history: [{ key: "a", text: "first", updatedAt: "2026-09-06T10:00:00Z" }],
    };
    const parts = feedbackParts(saved, "2026-09-08T10:00:00Z");
    assert.deepEqual(parts.past.map((p) => p["text"]), ["first", "second"]);
    assert.equal("history" in (parts.past[1] ?? {}), false);
    assert.deepEqual(stripHistory({ key: "a", history: [] }), { key: "a" });
  });

  it("labels ratings without reaching Object.prototype", async () => {
    const { ratingLabel, noteIsStale } = await import("../harness/review-logic.mjs");
    assert.equal(ratingLabel("good"), "👍");
    assert.equal(ratingLabel("constructor"), "constructor");
    assert.equal(noteIsStale("2026-09-07T00:00:00Z", "2026-09-08T00:00:00Z"), true);
    assert.equal(noteIsStale("2026-09-09T00:00:00Z", "2026-09-08T00:00:00Z"), false);
    assert.equal(noteIsStale(undefined, "2026-09-08T00:00:00Z"), false);
  });
});

describe("review page assembly", () => {
  it("inlines the logic module with its export keywords stripped", async () => {
    const { loadPageScript } = await import("../harness/review-page.js");
    const script = await loadPageScript();

    assert.match(script, /^function feedbackParts\(/m);
    assert.match(script, /^const RATING_LABEL =/m);
    new vm.Script(script);
    assert.doesNotMatch(script, /^\s*(export|import) /m);
  });

  it("escapes markup in the data payload so it cannot close the script tag", async () => {
    const { payloadJson, pageTemplate, loadPageScript } = await import("../harness/review-page.js");
    const json = payloadJson({ entries: [{ reply: "</script><img onerror=alert(1)>" }] });

    assert.match(json, /\\u003c\/script>/);
    const html = pageTemplate(json, "body{color:red}", await loadPageScript());
    const jsonStart = html.indexOf(">", html.indexOf('<script id="data"')) + 1;
    const dataBlock = html.slice(jsonStart, html.indexOf("</script>", jsonStart));
    assert.equal(dataBlock.includes("<"), false);
    assert.equal(JSON.parse(dataBlock).entries[0].reply, "</script><img onerror=alert(1)>");
  });
});
