import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  codexInstallPreExec,
  expandMatrix,
  jobDirName,
  parseHostCase,
  parseRunArgs,
  pickNewestVersion,
  shimScript,
  statusReplyMatches,
  workerName,
} from "../harness/lib.js";
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
    runs: 1,
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
    assert.ok(parsed.body.startsWith("Explain the tool."));
    assert.ok(parsed.body.endsWith("second paragraph."));
  });

  it("rejects a file without frontmatter", () => {
    assert.throws(() => parseHostCase("just text", "bad.md"), /frontmatter/);
  });

  it("rejects intensities outside 1-3", () => {
    const source = caseSource.replace("- 2", "- 5");
    assert.throws(() => parseHostCase(source, "bad.md"), /intensities/);
  });

  it("rejects an empty body", () => {
    const source = caseSource.replace(/---\nExplain[\s\S]*$/, "---\n");
    assert.throws(() => parseHostCase(source, "bad.md"), /empty body/);
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
    const jobs = expandMatrix(baseOptions({ profiles: ["glados"], intensities: [3] }), [parsed]);
    assert.deepEqual(jobs, [{ host: "claude", caseId: "sample-case", profile: "glados", intensity: 3, run: 1 }]);
    const sweep = expandMatrix(baseOptions({ profiles: ["glados", "sailor"], intensities: [1, 2, 3] }), [parsed]);
    assert.equal(sweep.length, 6);
    assert.deepEqual(sweep.map((j) => `${j.profile}-${j.intensity}`), [
      "glados-1",
      "glados-2",
      "glados-3",
      "sailor-1",
      "sailor-2",
      "sailor-3",
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
      "1,2,3",
      "--model",
      "haiku",
      "--dry-run",
      "--keep",
    ]);
    assert.deepEqual(options.hosts, ["claude", "pi"]);
    assert.equal(options.casePattern, "structured");
    assert.deepEqual(options.profiles, ["sailor", "glados"]);
    assert.deepEqual(options.intensities, [1, 2, 3]);
    assert.equal(options.model, "haiku");
    assert.equal(options.dryRun, true);
    assert.equal(options.keep, true);
  });

  it("rejects unknown hosts and bad intensities", () => {
    assert.throws(() => parseRunArgs(["--host", "gemini"]), /unknown host/);
    assert.throws(() => parseRunArgs(["--intensity", "4"]), /--intensity/);
    assert.throws(() => parseRunArgs(["--intensity", "2,4"]), /--intensity/);
  });
});
