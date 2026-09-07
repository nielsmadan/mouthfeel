import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";

import { prepareRelease, releaseVersion, validateMarketplace, validatePackage, validateReleaseVersion } from "../scripts/release.js";
import { tempDirectory } from "./helpers.js";

async function fixture(context: TestContext): Promise<{ root: string; version: string }> {
  const temporary = await tempDirectory(context, "mouthfeel-release-test-");
  const root = join(temporary, "checkout with spaces & symbols");
  await mkdir(root);
  for (const filename of ["package.json", "package-lock.json", "LICENSE", "dist"]) {
    await cp(resolve(filename), join(root, filename), { recursive: true });
  }
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };
  return { root, version };
}

async function releaseSnapshot(directory: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    assert.ok(entry.isFile() || entry.isDirectory(), `Unexpected release entry: ${path}`);
    snapshot[relative(directory, path)] = entry.isDirectory() ? "directory"
      : createHash("sha256").update(await readFile(path)).digest("hex");
  }
  return snapshot;
}

test("release tags must match a plain, publishable version", () => {
  validateReleaseVersion("0.9.0", "v0.9.0");
  validateReleaseVersion("0.9.1");
  assert.throws(() => validateReleaseVersion("0.9.0", "v0.1.0"), /Tag must match/);
  assert.throws(() => validateReleaseVersion("0.9.0", "0.9.0"), /Tag must match/);
  for (const version of ["../0.9.0", "01.9.0", "0.9.0+local", "0.9.0-beta.1", "0.9"]) {
    assert.throws(() => validateReleaseVersion(version), /major.minor.patch/);
  }
});

test("release checks lockfile and adapter version alignment", async (context) => {
  const { root, version } = await fixture(context);
  assert.equal(await releaseVersion(root, `v${version}`), version);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ version: "0.0.0", packages: { "": { version } } }));
  await assert.rejects(releaseVersion(root), /Lockfile version must match/);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ version, packages: { "": { version: "0.0.0" } } }));
  await assert.rejects(releaseVersion(root), /Lockfile root package version must match/);
  await assert.rejects(validatePackage("pi", join(root, "dist/pi/mouthfeel"), "0.0.0"), /pi package version/);
});

test("release packages survive extraction and validate all five native entrypoints", async (context) => {
  const { root, version } = await fixture(context);
  const destination = await prepareRelease(root, `v${version}`);
  assert.equal(destination, join(root, "release", `v${version}`));
  const artifacts = join(destination, "artifacts");
  const expected = [
    `mouthfeel-claude-${version}.tgz`,
    `mouthfeel-codex-${version}.tgz`,
    `mouthfeel-antigravity-${version}.tgz`,
    `mouthfeel-marketplace-${version}.tgz`,
    `nielsmadan-mouthfeel-pi-${version}.tgz`,
    `nielsmadan-opencode-mouthfeel-${version}.tgz`,
  ];
  assert.deepEqual((await readdir(artifacts)).sort(), [...expected, "SHA256SUMS"].sort());
  const report = JSON.parse(await readFile(join(destination, "release.json"), "utf8")) as {
    generator: string; version: string; tag: string; artifacts: Record<string, string>;
  };
  assert.equal(report.generator, "mouthfeel-release-v1");
  assert.equal(report.version, version);
  assert.equal(report.tag, `v${version}`);
  const checksums = await readFile(join(artifacts, "SHA256SUMS"), "utf8");
  assert.equal(checksums.trim().split("\n").length, expected.length);
  for (const filename of expected) {
    const hash = createHash("sha256").update(await readFile(join(artifacts, filename))).digest("hex");
    assert.equal(report.artifacts[filename], hash);
    assert.ok(checksums.split("\n").includes(`${hash}  ${filename}`));
  }
  await validateMarketplace(join(destination, "marketplace"), version);
  assert.deepEqual(await readdir(join(root, "release")), [`v${version}`]);

  assert.equal(await prepareRelease(root), destination);
  const previous = await releaseSnapshot(destination);
  await writeFile(join(root, "dist/pi/mouthfeel/index.js"), "import './missing-runtime.js';\nexport default function mouthfeel() {}\n");
  await assert.rejects(prepareRelease(root), /ERR_MODULE_NOT_FOUND/);
  assert.deepEqual(await releaseSnapshot(destination), previous);
  assert.deepEqual(await readdir(join(root, "release")), [`v${version}`]);
});

for (const host of ["claude", "codex"] as const) {
  for (const event of ["UserPromptSubmit", "SessionStart"] as const) {
    test(`release rejects a broken ${host} ${event} hook command`, async (context) => {
      const { root } = await fixture(context);
      const path = join(root, "dist", host, "mouthfeel/hooks/hooks.json");
      const config = JSON.parse(await readFile(path, "utf8")) as {
        hooks: Record<string, { hooks: { command: string }[] }[]>;
      };
      const hook = config.hooks[event]?.[0]?.hooks[0];
      assert.ok(hook);
      hook.command = hook.command.replace("runtime/hook.mjs", "runtime/missing.mjs");
      assert.match(hook.command, /runtime\/missing\.mjs/);
      await writeFile(path, JSON.stringify(config));
      await assert.rejects(prepareRelease(root), /MODULE_NOT_FOUND/);
    });
  }

  for (const mutation of ["wrong root variable", "unquoted root variable"] as const) {
    test(`release rejects ${host} hooks with the ${mutation}`, async (context) => {
      const { root } = await fixture(context);
      const path = join(root, "dist", host, "mouthfeel/hooks/hooks.json");
      const config = JSON.parse(await readFile(path, "utf8")) as {
        hooks: { UserPromptSubmit: { hooks: { command: string }[] }[] };
      };
      const hook = config.hooks.UserPromptSubmit[0]?.hooks[0];
      assert.ok(hook);
      const variable = host === "claude" ? "CLAUDE_PLUGIN_ROOT" : "PLUGIN_ROOT";
      const otherVariable = host === "claude" ? "PLUGIN_ROOT" : "CLAUDE_PLUGIN_ROOT";
      const original = hook.command;
      hook.command = mutation === "wrong root variable"
        ? hook.command.replace(`\${${variable}}`, `\${${otherVariable}}`)
        : hook.command.replaceAll('"', "");
      assert.notEqual(hook.command, original, "Command mutation must be applied");
      await writeFile(path, JSON.stringify(config));
      await assert.rejects(prepareRelease(root), /MODULE_NOT_FOUND/);
    });
  }
}

test("release rejects a broken Antigravity PreInvocation hook command", async (context) => {
  const { root } = await fixture(context);
  const path = join(root, "dist/antigravity/mouthfeel/hooks.json");
  const config = JSON.parse(await readFile(path, "utf8")) as {
    mouthfeel: { PreInvocation: { command: string }[] };
  };
  const hook = config.mouthfeel.PreInvocation[0];
  assert.ok(hook);
  hook.command = hook.command.replace("runtime/hook.mjs", "runtime/missing.mjs");
  assert.match(hook.command, /runtime\/missing\.mjs/);
  await writeFile(path, JSON.stringify(config));
  await assert.rejects(prepareRelease(root), /MODULE_NOT_FOUND/);
});

test("release rejects a misplaced marketplace source", async (context) => {
  const { root, version } = await fixture(context);
  const directory = join(root, "combined-marketplace");
  await cp(join(root, "dist/claude/.claude-plugin"), join(directory, ".claude-plugin"), { recursive: true });
  await cp(join(root, "dist/codex/.agents"), join(directory, ".agents"), { recursive: true });
  await assert.rejects(validateMarketplace(directory, version), /\.\/claude\/mouthfeel/);
});

test("release rejects files outside the bundled npm package contract", async (context) => {
  const { root, version } = await fixture(context);
  const directory = join(root, "dist/pi/mouthfeel");
  await writeFile(join(directory, "private-transcript.json"), "{}\n");
  await assert.rejects(validatePackage("pi", directory, version), /private-transcript.json/);
});

test("release refuses symlinked package content", async (context) => {
  const { root } = await fixture(context);
  await symlink(join(root, "LICENSE"), join(root, "dist/pi/mouthfeel/linked-license"));
  await assert.rejects(prepareRelease(root), /link or special file/);
});

test("release rejects unexpected files beside a native package", async (context) => {
  const { root } = await fixture(context);
  await writeFile(join(root, "dist/claude/private-transcript.json"), "{}\n");
  await assert.rejects(prepareRelease(root), /unexpected files outside the package/);
});

test("release preserves an unrecognized output directory", async (context) => {
  const { root, version } = await fixture(context);
  const destination = join(root, "release", `v${version}`);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "release.json"), JSON.stringify({ generator: "someone-else" }));
  await assert.rejects(prepareRelease(root), /unrecognized release directory/);
  assert.deepEqual(JSON.parse(await readFile(join(destination, "release.json"), "utf8")), { generator: "someone-else" });
});
