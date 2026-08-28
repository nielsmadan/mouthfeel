import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { tempDirectory } from "./helpers.js";

async function waitForFile(path: string, operation: Promise<unknown>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      readFile(path).then(() => "ready" as const, () => "retry" as const),
      operation.then(() => "finished" as const),
    ]);
    if (outcome === "ready") return;
    if (outcome === "finished") throw new Error(`operation finished before ${path} was created`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function fixture(context: TestContext, options: {
  updateExitCode?: number;
  enableExitCode?: number;
  alreadyEnabled?: boolean;
  enabledProjectCopy?: boolean;
  delayMs?: number;
  breakManifestOnEnable?: boolean;
} = {}): Promise<{
  root: string;
  env: NodeJS.ProcessEnv;
}> {
  const root = await tempDirectory(context, "mouthfeel-dev-claude-");
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: { build: "node build.mjs" },
  }));
  await writeFile(join(root, "build.mjs"), `
import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = process.cwd();
const plugin = root + "/dist/claude/mouthfeel/.claude-plugin";
await mkdir(plugin, { recursive: true });
await writeFile(plugin + "/plugin.json", JSON.stringify({ name: "mouthfeel", version: "0.1.0" }, null, 2) + "\\n");
let count = 0;
try { count = Number(await readFile(root + "/build-count", "utf8")); } catch {}
await writeFile(root + "/build-count", String(count + 1));
`);
  const claude = join(bin, "claude");
  await writeFile(claude, `#!/usr/bin/env node
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const command = process.argv.slice(2).join(" ");
if (![
  "plugin update mouthfeel@mouthfeel",
  "plugin update mouthfeel@mouthfeel --scope user",
  "plugin list --json",
  "plugin enable mouthfeel@mouthfeel",
  "plugin enable mouthfeel@mouthfeel --scope user",
].includes(command)) process.exit(9);
const root = process.cwd();
appendFileSync(root + "/claude-commands", command + "\\n");
if (command.startsWith("plugin update")) {
  const manifest = JSON.parse(readFileSync(root + "/dist/claude/mouthfeel/.claude-plugin/plugin.json", "utf8"));
  writeFileSync(root + "/installed-version", manifest.version);
}
if (command === "plugin list --json") {
  const installed = [{
    id: "mouthfeel@mouthfeel",
    version: "0.1.0",
    scope: "user",
    enabled: ${options.alreadyEnabled ?? false},
    installPath: "/plugins/user/mouthfeel",
    installedAt: "2026-08-25T00:00:00.000Z",
    lastUpdated: "2026-08-25T00:00:00.000Z",
  }];
  if (${options.enabledProjectCopy ?? false}) installed.push({
    ...installed[0],
    scope: "project",
    enabled: true,
    installPath: "/plugins/project/mouthfeel",
  });
  process.stdout.write(JSON.stringify(installed));
}
if (command.startsWith("plugin enable") && ${options.breakManifestOnEnable ?? false}) {
  const plugin = root + "/dist/claude/mouthfeel/.claude-plugin";
  rmSync(plugin, { recursive: true, force: true });
  writeFileSync(plugin, "not a directory");
}
const exitCode = command.startsWith("plugin update")
  ? ${options.updateExitCode ?? 0}
  : command.startsWith("plugin enable")
    ? ${options.alreadyEnabled ? 1 : options.enableExitCode ?? 0}
    : 0;
setTimeout(() => process.exit(exitCode), ${options.delayMs ?? 0});
`);
  await chmod(claude, 0o755);
  return {
    root,
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
  };
}

test("updates Claude with a unique development version", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context);

  const version = await installClaudeForDevelopment({
    root,
    env,
    now: new Date("2026-08-24T10:11:12.000Z"),
    stdio: "pipe",
  });

  assert.match(version, /^0\.1\.0\+claude\.local-20260824-101112-[\da-f-]{36}$/);
  assert.equal(await readFile(join(root, "installed-version"), "utf8"), version);
  assert.equal(await readFile(join(root, "claude-commands"), "utf8"), [
    "plugin update mouthfeel@mouthfeel --scope user",
    "plugin list --json",
    "plugin enable mouthfeel@mouthfeel --scope user",
    "",
  ].join("\n"));
  assert.equal(await readFile(join(root, "build-count"), "utf8"), "1");
  assert.equal(await readFile(
    join(root, "dist/claude/mouthfeel/.claude-plugin/plugin.json"),
    "utf8",
  ), `${JSON.stringify({ name: "mouthfeel", version: "0.1.0" }, null, 2)}\n`);
});

test("does not re-enable an already enabled Claude plugin", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, { alreadyEnabled: true });

  await installClaudeForDevelopment({ root, env, stdio: "pipe" });

  assert.equal(await readFile(join(root, "claude-commands"), "utf8"), [
    "plugin update mouthfeel@mouthfeel --scope user",
    "plugin list --json",
    "",
  ].join("\n"));
});

test("enables the user-scoped Claude plugin when only a project copy is enabled", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, { enabledProjectCopy: true });

  await installClaudeForDevelopment({ root, env, stdio: "pipe" });

  assert.equal(await readFile(join(root, "claude-commands"), "utf8"), [
    "plugin update mouthfeel@mouthfeel --scope user",
    "plugin list --json",
    "plugin enable mouthfeel@mouthfeel --scope user",
    "",
  ].join("\n"));
});

test("uses distinct development versions for updates with the same timestamp", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context);
  const now = new Date("2026-08-24T10:11:12.000Z");

  const versions = [
    await installClaudeForDevelopment({ root, env, now, stdio: "pipe" }),
    await installClaudeForDevelopment({ root, env, now, stdio: "pipe" }),
  ];

  assert.equal(new Set(versions).size, 2);
});

test("restores the Claude manifest when updating fails", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, { updateExitCode: 17 });

  await assert.rejects(installClaudeForDevelopment({
    root,
    env,
    now: new Date("2026-08-24T10:11:12.000Z"),
    stdio: "pipe",
  }), /claude plugin update.*17/i);

  assert.equal(JSON.parse(await readFile(
    join(root, "dist/claude/mouthfeel/.claude-plugin/plugin.json"),
    "utf8",
  )).version, "0.1.0");
});

test("restores the Claude manifest when enabling fails", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, { enableExitCode: 19 });

  await assert.rejects(installClaudeForDevelopment({
    root,
    env,
    now: new Date("2026-08-24T10:11:12.000Z"),
    stdio: "pipe",
  }), /claude plugin enable.*19/i);

  assert.equal(JSON.parse(await readFile(
    join(root, "dist/claude/mouthfeel/.claude-plugin/plugin.json"),
    "utf8",
  )).version, "0.1.0");
});

test("preserves the enable and manifest restoration failures", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, {
    enableExitCode: 19,
    breakManifestOnEnable: true,
  });

  let caught: unknown;
  try {
    await installClaudeForDevelopment({
      root,
      env,
      now: new Date("2026-08-24T10:11:12.000Z"),
      stdio: "pipe",
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof AggregateError);
  assert.equal(caught.errors.length, 2);
  assert.match(String(caught.errors[0]), /claude plugin enable.*19/i);
  assert.match(String(caught.errors[1]), /ENOTDIR/i);
});

test("restores the Claude manifest when updating is aborted", async (context) => {
  const { installClaudeForDevelopment } = await import("../scripts/dev-claude.js");
  const { root, env } = await fixture(context, { delayMs: 5_000 });
  const controller = new AbortController();
  const update = installClaudeForDevelopment({
    root,
    env,
    now: new Date("2026-08-24T10:11:12.000Z"),
    signal: controller.signal,
    stdio: "pipe",
  });
  await waitForFile(join(root, "installed-version"), update);
  controller.abort();

  await assert.rejects(update, /abort/i);
  assert.equal(JSON.parse(await readFile(
    join(root, "dist/claude/mouthfeel/.claude-plugin/plugin.json"),
    "utf8",
  )).version, "0.1.0");
});
