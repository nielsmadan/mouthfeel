import assert from "node:assert/strict";
import { access, chmod, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { installPiForDevelopment } from "../scripts/dev-pi.js";
import { tempDirectory } from "./helpers.js";

async function waitForFile(path: string, operation: Promise<unknown>): Promise<void> {
  const completion = operation.then(
    () => ({ type: "finished" as const }),
    (error: unknown) => ({ type: "failed" as const, error }),
  );
  while (true) {
    const outcome = await Promise.race([
      access(path).then(
        () => ({ type: "ready" as const }),
        () => ({ type: "waiting" as const }),
      ),
      completion,
    ]);
    if (outcome.type === "ready") return;
    if (outcome.type === "failed") throw outcome.error;
    if (outcome.type === "finished") throw new Error(`operation finished before ${path} was created`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function readCommands(path: string): Promise<Array<{ args: string[]; cwd: string }>> {
  return (await readFile(path, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as { args: string[]; cwd: string });
}

async function fixture(context: TestContext, options: {
  agentRoot?: string;
  agentRootSuffix?: string;
  buildExitCode?: number;
  content?: string;
  installDelayMs?: number;
  installExitCode?: number;
  legacyInstalled?: boolean;
  rootSuffix?: string;
} = {}): Promise<{
  root: string;
  agentRoot: string;
  commandLog: string;
  installStarted: string;
  env: NodeJS.ProcessEnv;
}> {
  const temporaryRoot = await tempDirectory(context, "mouthfeel-dev-pi-");
  const root = options.rootSuffix ? join(temporaryRoot, options.rootSuffix) : temporaryRoot;
  const agentRoot = options.agentRoot ?? join(temporaryRoot, options.agentRootSuffix ?? "pi-agent");
  const commandLog = join(temporaryRoot, "pi-command.json");
  const installStarted = join(temporaryRoot, "pi-install-started");
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: { build: "node build.mjs" },
  }));
  await writeFile(join(root, "build.mjs"), `
import { mkdir, writeFile } from "node:fs/promises";
if (${options.buildExitCode ?? 0}) process.exit(${options.buildExitCode ?? 0});
const output = process.cwd() + "/dist/pi/mouthfeel";
await mkdir(output, { recursive: true });
await writeFile(output + "/index.js", ${JSON.stringify(options.content ?? "export default function mouthfeel() {}\n")});
`);
  const pi = join(bin, "pi");
  await writeFile(pi, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.PI_COMMAND_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[0] === "list" && args.length === 1) {
  if (process.env.PI_LEGACY_SOURCE) process.stdout.write("User packages:\\n  " + process.env.PI_LEGACY_SOURCE + "\\n");
  process.exit(0);
}
if (!(["install", "remove"].includes(args[0])) || args.length !== 2) process.exit(9);
if (args[0] === "remove") process.exit(0);
writeFileSync(process.env.PI_INSTALL_STARTED, "yes");
setTimeout(() => process.exit(${options.installExitCode ?? 0}), ${options.installDelayMs ?? 0});
`);
  await chmod(pi, 0o755);
  return {
    root,
    agentRoot,
    commandLog,
    installStarted,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      PI_CODING_AGENT_DIR: agentRoot,
      PI_COMMAND_LOG: commandLog,
      PI_INSTALL_STARTED: installStarted,
      PI_LEGACY_SOURCE: options.legacyInstalled ? join(root, "dist", "pi", "mouthfeel") : "",
    },
  };
}

test("publishes and globally installs the Pi package from a stable path", async (context) => {
  const { root, agentRoot, commandLog, env } = await fixture(context);

  const destination = await installPiForDevelopment({ root, env, stdio: "pipe" });

  assert.equal(destination, join(agentRoot, "dev-packages", "mouthfeel"));
  assert.deepEqual(await readCommands(commandLog), [
    { args: ["install", "./mouthfeel"], cwd: await realpath(dirname(destination)) },
    { args: ["list"], cwd: await realpath(root) },
  ]);
  assert.equal(
    await readFile(join(destination, "index.js"), "utf8"),
    "export default function mouthfeel() {}\n",
  );
});

test("uses the same Pi development package across checkouts", async (context) => {
  const first = await fixture(context, { content: "export const version = 1;\n" });
  const second = await fixture(context, {
    agentRoot: first.agentRoot,
    content: "export const version = 2;\n",
  });

  const firstDestination = await installPiForDevelopment({
    root: first.root,
    env: first.env,
    stdio: "pipe",
  });
  const secondDestination = await installPiForDevelopment({
    root: second.root,
    env: second.env,
    stdio: "pipe",
  });

  assert.equal(secondDestination, firstDestination);
  assert.equal(await readFile(join(firstDestination, "index.js"), "utf8"), "export const version = 2;\n");
  assert.deepEqual(await readCommands(second.commandLog), [
    { args: ["install", "./mouthfeel"], cwd: await realpath(dirname(firstDestination)) },
    { args: ["list"], cwd: await realpath(second.root) },
  ]);
});

test("does not replace or install the Pi package when the build fails", async (context) => {
  const { root, agentRoot, commandLog, env } = await fixture(context, { buildExitCode: 17 });
  const destination = join(agentRoot, "dev-packages", "mouthfeel");
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "index.js"), "export const version = 'previous';\n");

  await assert.rejects(
    installPiForDevelopment({ root, env, stdio: "pipe" }),
    /npm run build.*17/i,
  );

  assert.equal(await readFile(join(destination, "index.js"), "utf8"), "export const version = 'previous';\n");
  await assert.rejects(readFile(commandLog), /ENOENT/);
});

test("reports a failed Pi installation", async (context) => {
  const { root, agentRoot, env } = await fixture(context, { installExitCode: 19 });

  await assert.rejects(
    installPiForDevelopment({ root, env, stdio: "pipe" }),
    /pi install.*19/i,
  );

  assert.equal(
    await readFile(join(agentRoot, "dev-packages", "mouthfeel", "index.js"), "utf8"),
    "export default function mouthfeel() {}\n",
  );
});

test("removes the checkout-specific registration used by earlier development installs", async (context) => {
  const { root, agentRoot, commandLog, env } = await fixture(context, { legacyInstalled: true });
  const destination = await installPiForDevelopment({ root, env, stdio: "pipe" });

  assert.deepEqual(await readCommands(commandLog), [
    { args: ["install", "./mouthfeel"], cwd: await realpath(dirname(destination)) },
    { args: ["list"], cwd: await realpath(root) },
    { args: ["remove", "./mouthfeel"], cwd: await realpath(join(root, "dist", "pi")) },
  ]);
  assert.equal(destination, join(agentRoot, "dev-packages", "mouthfeel"));
});

test("aborts an in-progress Pi installation", async (context) => {
  const { root, installStarted, env } = await fixture(context, { installDelayMs: 5_000 });
  const controller = new AbortController();
  const install = installPiForDevelopment({
    root,
    env,
    signal: controller.signal,
    stdio: "pipe",
  });
  await waitForFile(installStarted, install);
  controller.abort();

  await assert.rejects(install, /abort/i);
});

test("installs safely when development paths contain spaces and shell metacharacters", async (context) => {
  const { root, agentRoot, commandLog, env } = await fixture(context, {
    agentRootSuffix: "Pi agent & config",
    rootSuffix: "checkout with spaces & symbols",
  });

  const destination = await installPiForDevelopment({
    root,
    env,
    platform: "win32",
    stdio: "pipe",
  });

  assert.equal(destination, join(agentRoot, "dev-packages", "mouthfeel"));
  assert.deepEqual(await readCommands(commandLog), [
    { args: ["install", "./mouthfeel"], cwd: await realpath(dirname(destination)) },
    { args: ["list"], cwd: await realpath(root) },
  ]);
});
