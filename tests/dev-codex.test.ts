import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { installCodexForDevelopment, shellForPlatform } from "../scripts/dev-codex.js";
import { tempDirectory } from "./helpers.js";

async function fixture(context: TestContext, options: {
  exitCode?: number;
  outputBytes?: number;
  delayMs?: number;
} = {}): Promise<{
  root: string;
  env: NodeJS.ProcessEnv;
}> {
  const root = await tempDirectory(context, "mouthfeel-dev-codex-");
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: { build: "node build.mjs" },
  }));
  await writeFile(join(root, "build.mjs"), `
import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = process.cwd();
const plugin = root + "/dist/codex/mouthfeel/.codex-plugin";
await mkdir(plugin, { recursive: true });
await writeFile(plugin + "/plugin.json", JSON.stringify({ name: "mouthfeel", version: "0.1.0" }, null, 2) + "\\n");
let count = 0;
try { count = Number(await readFile(root + "/build-count", "utf8")); } catch {}
await writeFile(root + "/build-count", String(count + 1));
`);
  const codex = join(bin, "codex");
  await writeFile(codex, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const expected = "plugin add mouthfeel@mouthfeel";
if (process.argv.slice(2).join(" ") !== expected) process.exit(9);
const root = process.cwd();
const manifest = JSON.parse(readFileSync(root + "/dist/codex/mouthfeel/.codex-plugin/plugin.json", "utf8"));
writeFileSync(root + "/installed-version", manifest.version);
process.stdout.write("x".repeat(${options.outputBytes ?? 0}));
setTimeout(() => process.exit(${options.exitCode ?? 0}), ${options.delayMs ?? 0});
`);
  await chmod(codex, 0o755);
  return {
    root,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
  };
}

test("installs a cache-busted Codex plugin and restores the canonical manifest", async (context) => {
  const { root, env } = await fixture(context);

  const version = await installCodexForDevelopment({
    root,
    env,
    now: new Date("2026-08-22T10:11:12.000Z"),
    stdio: "pipe",
  });

  assert.equal(version, "0.1.0+codex.local-20260822-101112");
  assert.equal(await readFile(join(root, "installed-version"), "utf8"), version);
  assert.equal(await readFile(
    join(root, "dist/codex/mouthfeel/.codex-plugin/plugin.json"),
    "utf8",
  ), `${JSON.stringify({ name: "mouthfeel", version: "0.1.0" }, null, 2)}\n`);
  assert.equal(await readFile(join(root, "build-count"), "utf8"), "1");
});

test("restores canonical generated files when Codex installation fails", async (context) => {
  const { root, env } = await fixture(context, { exitCode: 17 });

  await assert.rejects(installCodexForDevelopment({
    root,
    env,
    now: new Date("2026-08-22T10:11:12.000Z"),
    stdio: "pipe",
  }), /codex plugin add.*17/i);

  assert.equal(JSON.parse(await readFile(
    join(root, "dist/codex/mouthfeel/.codex-plugin/plugin.json"),
    "utf8",
  )).version, "0.1.0");
  assert.equal(await readFile(join(root, "build-count"), "utf8"), "1");
});

test("restores the canonical manifest when installation is aborted", async (context) => {
  const { root, env } = await fixture(context, { delayMs: 5_000 });
  const controller = new AbortController();
  const install = installCodexForDevelopment({
    root,
    env,
    now: new Date("2026-08-22T10:11:12.000Z"),
    signal: controller.signal,
    stdio: "pipe",
  });
  while (true) {
    try {
      await readFile(join(root, "installed-version"));
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  controller.abort();

  await assert.rejects(install, /abort/i);
  assert.equal(JSON.parse(await readFile(
    join(root, "dist/codex/mouthfeel/.codex-plugin/plugin.json"),
    "utf8",
  )).version, "0.1.0");
});

test("drains piped child output", async (context) => {
  const { root, env } = await fixture(context, { outputBytes: 1_000_000 });
  await installCodexForDevelopment({
    root,
    env,
    now: new Date("2026-08-22T10:11:12.000Z"),
    stdio: "pipe",
  });
});

test("uses a command shell on Windows", () => {
  assert.equal(shellForPlatform("win32"), true);
  assert.equal(shellForPlatform("darwin"), false);
});
