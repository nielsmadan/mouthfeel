import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { runNode } from "./helpers.js";

const dist = resolve("dist");

test("build emits native packages for all five hosts", async () => {
  const files = [
    "claude/mouthfeel/.claude-plugin/plugin.json",
    "claude/.claude-plugin/marketplace.json",
    "claude/mouthfeel/hooks/hooks.json",
    "claude/mouthfeel/runtime/hook.mjs",
    "claude/mouthfeel/skills/use/SKILL.md",
    "claude/mouthfeel/README.md",
    "codex/mouthfeel/.codex-plugin/plugin.json",
    "codex/.agents/plugins/marketplace.json",
    "codex/mouthfeel/hooks/hooks.json",
    "codex/mouthfeel/runtime/hook.mjs",
    "codex/mouthfeel/skills/use/SKILL.md",
    "codex/mouthfeel/README.md",
    "pi/mouthfeel/package.json",
    "pi/mouthfeel/index.js",
    "pi/mouthfeel/README.md",
    "opencode/mouthfeel/package.json",
    "opencode/mouthfeel/index.js",
    "opencode/mouthfeel/README.md",
    "antigravity/mouthfeel/plugin.json",
    "antigravity/mouthfeel/hooks.json",
    "antigravity/mouthfeel/runtime/hook.mjs",
    "antigravity/mouthfeel/skills/mouthfeel/SKILL.md",
    "antigravity/mouthfeel/README.md",
  ];
  for (const file of files) assert.equal((await stat(join(dist, file))).isFile(), true, file);
  for (const host of ["claude", "codex", "pi", "opencode", "antigravity"]) {
    assert.equal((await stat(join(dist, host, "mouthfeel", "LICENSE"))).isFile(), true, host);
  }
});

test("each package contains the same compiled roster", async () => {
  const hosts = ["claude", "codex", "antigravity"];
  for (const host of hosts) {
    const registry = JSON.parse(await readFile(join(dist, host, "mouthfeel", "registry.json"), "utf8")) as unknown[];
    assert.equal(registry.length, 18, host);
  }
});

test("generated entrypoints and lifecycle hooks are executable", async () => {
  const pi = await import(pathToFileURL(join(dist, "pi/mouthfeel/index.js")).href) as { default?: unknown };
  assert.equal(typeof pi.default, "function");
  const opencode = await import(pathToFileURL(join(dist, "opencode/mouthfeel/index.js")).href) as { Mouthfeel?: unknown };
  assert.equal(typeof opencode.Mouthfeel, "function");

  for (const host of ["claude", "codex"] as const) {
    const result = await runNode(join(dist, host, "mouthfeel/runtime/hook.mjs"), "{}");
    assert.equal(result.code, 0, `${host}: ${result.stderr}`);
    assert.equal(result.stdout, "", host);
  }
  const antigravity = await runNode(join(dist, "antigravity/mouthfeel/runtime/hook.mjs"), "{}");
  assert.equal(antigravity.code, 0, antigravity.stderr);
  assert.equal(antigravity.stdout, "{}\n");
});

test("generated lifecycle configuration covers every session transition", async () => {
  for (const host of ["claude", "codex"] as const) {
    const config = JSON.parse(await readFile(join(dist, host, "mouthfeel/hooks/hooks.json"), "utf8")) as {
      hooks: { SessionStart: { matcher: string }[] };
    };
    assert.equal(config.hooks.SessionStart[0]?.matcher, "startup|resume|clear|compact", host);
  }
  for (const host of ["pi", "opencode"] as const) {
    const manifest = JSON.parse(await readFile(join(dist, host, "mouthfeel/package.json"), "utf8")) as { files: string[] };
    assert.deepEqual(manifest.files, ["index.js", "README.md"], host);
  }
});

test("package versions and README roster stay aligned", async () => {
  const rootPackage = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  const manifestPaths = [
    "claude/mouthfeel/.claude-plugin/plugin.json",
    "codex/mouthfeel/.codex-plugin/plugin.json",
    "pi/mouthfeel/package.json",
    "opencode/mouthfeel/package.json",
  ];
  for (const path of manifestPaths) {
    const manifest = JSON.parse(await readFile(join(dist, path), "utf8")) as { version: string };
    assert.equal(manifest.version, rootPackage.version, path);
  }
  const registry = JSON.parse(await readFile(join(dist, "codex/mouthfeel/registry.json"), "utf8")) as { id: string }[];
  const readme = await readFile(resolve("README.md"), "utf8");
  for (const profile of registry) assert.match(readme, new RegExp(`\\b${profile.id}\\b`), profile.id);
});
