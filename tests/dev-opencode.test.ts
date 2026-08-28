import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { installOpenCodeForDevelopment } from "../scripts/dev-opencode.js";
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

async function fixture(context: TestContext, options: {
  buildExitCode?: number;
  buildDelayMs?: number;
} = {}): Promise<{
  root: string;
  configRoot: string;
  env: NodeJS.ProcessEnv;
}> {
  const root = await tempDirectory(context, "mouthfeel-dev-opencode-");
  const configRoot = join(root, "opencode-config");
  await writeFile(join(root, "package.json"), JSON.stringify({
    type: "module",
    scripts: { build: "node build.mjs" },
  }));
  await writeFile(join(root, "plugin-source.js"), "export const Mouthfeel = 'fixture';\n");
  await writeFile(join(root, "build.mjs"), `
import { mkdir, readFile, writeFile } from "node:fs/promises";
if (${options.buildExitCode ?? 0}) process.exit(${options.buildExitCode ?? 0});
const root = process.cwd();
await writeFile(root + "/build-started", "yes");
await new Promise((resolve) => setTimeout(resolve, ${options.buildDelayMs ?? 0}));
const output = root + "/dist/opencode/mouthfeel";
await mkdir(output, { recursive: true });
await writeFile(output + "/index.js", await readFile(root + "/plugin-source.js"));
await writeFile(root + "/build-complete", "yes");
`);
  return {
    root,
    configRoot,
    env: { ...process.env, OPENCODE_CONFIG_DIR: configRoot },
  };
}

test("builds and installs the OpenCode plugin in the global config directory", async (context) => {
  const { root, configRoot, env } = await fixture(context);

  const installed = await installOpenCodeForDevelopment({ root, env, stdio: "pipe" });

  assert.equal(installed, join(configRoot, "plugins", "mouthfeel.js"));
  assert.equal(await readFile(installed, "utf8"), "export const Mouthfeel = 'fixture';\n");
  assert.equal(await readFile(join(root, "build-complete"), "utf8"), "yes");
});

test("uses the XDG config root when OpenCode has no explicit override", async (context) => {
  const { root, env } = await fixture(context);
  const xdgRoot = join(root, "xdg-config");
  const installed = await installOpenCodeForDevelopment({
    root,
    env: {
      ...env,
      OPENCODE_CONFIG_DIR: "",
      XDG_CONFIG_HOME: xdgRoot,
    },
    stdio: "pipe",
  });

  assert.equal(installed, join(xdgRoot, "opencode", "plugins", "mouthfeel.js"));
  assert.equal(await readFile(installed, "utf8"), "export const Mouthfeel = 'fixture';\n");
});

test("replaces the installed plugin with the latest build", async (context) => {
  const { root, env } = await fixture(context);
  const installed = await installOpenCodeForDevelopment({ root, env, stdio: "pipe" });
  await writeFile(join(root, "plugin-source.js"), "export const Mouthfeel = 'updated';\n");

  await installOpenCodeForDevelopment({ root, env, stdio: "pipe" });

  assert.equal(await readFile(installed, "utf8"), "export const Mouthfeel = 'updated';\n");
});

test("keeps the installed plugin when the build fails", async (context) => {
  const { root, configRoot, env } = await fixture(context, { buildExitCode: 17 });
  const installed = join(configRoot, "plugins", "mouthfeel.js");
  await mkdir(join(configRoot, "plugins"), { recursive: true });
  await writeFile(installed, "export const Mouthfeel = 'previous';\n");

  await assert.rejects(
    installOpenCodeForDevelopment({ root, env, stdio: "pipe" }),
    /npm run build.*17/i,
  );

  assert.equal(await readFile(installed, "utf8"), "export const Mouthfeel = 'previous';\n");
});

test("keeps the installed plugin when the build is interrupted", async (context) => {
  const { root, configRoot, env } = await fixture(context, { buildDelayMs: 500 });
  const installed = join(configRoot, "plugins", "mouthfeel.js");
  await mkdir(join(configRoot, "plugins"), { recursive: true });
  await writeFile(installed, "export const Mouthfeel = 'previous';\n");
  const controller = new AbortController();
  const install = installOpenCodeForDevelopment({
    root,
    env,
    signal: controller.signal,
    stdio: "pipe",
  });
  await waitForFile(join(root, "build-started"), install);
  controller.abort();

  await assert.rejects(install, /abort/i);
  assert.equal(await readFile(installed, "utf8"), "export const Mouthfeel = 'previous';\n");
});
