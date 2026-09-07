import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runCommand } from "./dev-common.js";

const exec = promisify(execFile);
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const hosts = ["claude", "codex", "pi", "opencode", "antigravity"] as const;
type Host = typeof hosts[number];
interface PackageManifest {
  name: string;
  version: string;
  type?: string;
  engines?: { node: string };
  publishConfig?: { access: string };
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  pi?: { extensions: string[] };
  exports?: string;
}
interface Marketplace<Source> {
  name: string;
  plugins: { source: Source; policy?: { installation: string; authentication: string }; category: string }[];
}
type ClaudeMarketplace = Marketplace<string>;
type CodexMarketplace = Marketplace<{ source: string; path: string }>;
const manifests: Record<Host, string> = {
  claude: ".claude-plugin/plugin.json",
  codex: ".codex-plugin/plugin.json",
  pi: "package.json",
  opencode: "package.json",
  antigravity: "plugin.json",
};

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function validateReleaseVersion(version: string, tag?: string): void {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Release version must be major.minor.patch");
  if (tag !== undefined) assert.equal(tag, `v${version}`, "Tag must match package.json version");
}

export async function releaseVersion(root: string, tag?: string): Promise<string> {
  const manifest = await json<PackageManifest>(join(root, "package.json"));
  validateReleaseVersion(manifest.version, tag);
  const lock = await json<{ version: string; packages: { "": { version: string } } }>(join(root, "package-lock.json"));
  assert.equal(lock.version, manifest.version, "Lockfile version must match package.json");
  assert.equal(lock.packages[""].version, manifest.version, "Lockfile root package version must match");
  return manifest.version;
}

async function inventory(directory: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(entry.isFile() || entry.isDirectory(), `Package contains a link or special file: ${relative}`);
    if (entry.isDirectory()) Object.assign(files, await inventory(directory, relative));
    else files[relative] = createHash("sha256").update(await readFile(join(directory, relative))).digest("hex");
  }
  return files;
}

export async function validatePackage(host: Host, directory: string, version: string): Promise<void> {
  const manifest = await json<PackageManifest>(join(directory, manifests[host]));
  assert.equal(manifest.version, version, `${host} package version`);
  const expectedName = host === "pi" ? "@nielsmadan/mouthfeel-pi"
    : host === "opencode" ? "@nielsmadan/opencode-mouthfeel" : "mouthfeel";
  assert.equal(manifest.name, expectedName, `${host} package name`);
  const files = await inventory(directory);
  for (const required of ["README.md", "LICENSE", manifests[host]]) assert.ok(files[required], `${host}: missing ${required}`);
  if (host === "pi" || host === "opencode") {
    assert.deepEqual(Object.keys(files).sort(), ["LICENSE", "README.md", "index.js", "package.json"]);
    assert.equal(manifest.type, "module");
    assert.equal(manifest.engines?.node, ">=22.19.0");
    assert.equal(manifest.publishConfig?.access, "public");
    assert.deepEqual(manifest.dependencies ?? {}, {}, "Runtime must be bundled");
    assert.deepEqual(manifest.scripts ?? {}, {}, "Published packages must not require lifecycle scripts");
    if (host === "pi") assert.deepEqual(manifest.pi?.extensions, ["./index.js"]);
    else assert.equal(manifest.exports, "./index.js");
  } else {
    assert.deepEqual(Object.keys(files).sort(), [
      "README.md", "LICENSE", manifests[host], "registry.json", "runtime/hook.mjs",
      host === "antigravity" ? "hooks.json" : "hooks/hooks.json",
      host === "antigravity" ? "skills/mouthfeel/SKILL.md" : "skills/use/SKILL.md",
    ].sort(), `${host}: unexpected package files`);
    const profiles = await json(join(directory, "registry.json"));
    assert.ok(Array.isArray(profiles) && profiles.length > 0, `${host}: missing profiles`);
  }
}

export async function validateMarketplace(directory: string, version: string): Promise<void> {
  const claude = await json<ClaudeMarketplace>(join(directory, ".claude-plugin/marketplace.json"));
  const codex = await json<CodexMarketplace>(join(directory, ".agents/plugins/marketplace.json"));
  assert.equal(claude.name, "mouthfeel");
  assert.equal(codex.name, "mouthfeel");
  assert.equal(claude.plugins.length, 1);
  assert.equal(codex.plugins.length, 1);
  const [claudeEntry] = claude.plugins;
  const [codexEntry] = codex.plugins;
  assert.ok(claudeEntry && codexEntry);
  assert.equal(claudeEntry.source, "./claude/mouthfeel");
  assert.deepEqual(codexEntry.source, { source: "local", path: "./plugins/mouthfeel" });
  assert.deepEqual(codexEntry.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(codexEntry.category, "Developer Tools");
  await validatePackage("claude", join(directory, claudeEntry.source), version);
  await validatePackage("codex", join(directory, codexEntry.source.path), version);
}

async function archive(directory: string, output: string): Promise<void> {
  await exec("tar", ["-czf", output, "-C", directory, "."], {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
}

async function unpack(archivePath: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  await exec("tar", ["-xzf", archivePath, "-C", destination]);
}

async function smoke(host: Host, directory: string, temporary: string): Promise<void> {
  const runtime = join(temporary, `smoke-${host}.mjs`);
  await cp(join(scriptRoot, "smoke-package.mjs"), runtime);
  const state = join(temporary, `state-${host}`);
  const { stdout } = await exec(process.execPath, [runtime, host, directory, state], {
    cwd: temporary,
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_PATH: "",
      NODE_OPTIONS: "",
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
      PLUGIN_ROOT: host === "codex" ? directory : undefined,
      CLAUDE_PLUGIN_ROOT: host === "claude" ? directory : undefined,
      PLUGIN_DATA: host === "codex" ? state : undefined,
      CLAUDE_PLUGIN_DATA: host === "claude" ? state : undefined,
      XDG_STATE_HOME: state,
      LOCALAPPDATA: state,
    },
  });
  assert.equal(stdout.trim(), `${host}: activation and restore passed`);
}

async function publishDirectory(stage: string, destination: string): Promise<void> {
  const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!existing) {
    await rename(stage, destination);
    return;
  }
  assert.ok(existing.isDirectory() && !existing.isSymbolicLink(), "Release destination must be a generated directory");
  const previous = await json<{ generator: string }>(join(destination, "release.json"));
  assert.equal(previous.generator, "mouthfeel-release-v1", "Refusing to replace an unrecognized release directory");
  const backup = await mkdtemp(join(dirname(destination), ".previous-"));
  await rename(destination, join(backup, "release"));
  try {
    await rename(stage, destination);
  } catch (error) {
    await rename(join(backup, "release"), destination);
    await rm(backup, { recursive: true, force: true });
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function prepareRelease(root: string, tag?: string): Promise<string> {
  const version = await releaseVersion(root, tag);
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "Run release preparation through npm run release:prepare");
  const outputRoot = join(root, "release");
  await mkdir(outputRoot, { recursive: true });
  assert.equal((await lstat(outputRoot)).isSymbolicLink(), false, "Release output directory must not be a symlink");
  const stage = await mkdtemp(join(outputRoot, ".prepare-"));
  const temporary = await mkdtemp(join(tmpdir(), "mouthfeel-release-"));
  try {
    const artifacts = join(stage, "artifacts");
    await mkdir(artifacts);
    const source = join(temporary, "source");
    await inventory(join(root, "dist"));
    await cp(join(root, "dist"), source, { recursive: true });
    for (const host of hosts) {
      const packageRoot = join(source, host, "mouthfeel");
      await validatePackage(host, packageRoot, version);
      const catalog = host === "claude" ? ".claude-plugin/marketplace.json"
        : host === "codex" ? ".agents/plugins/marketplace.json" : null;
      assert.deepEqual(Object.keys(await inventory(join(source, host))).sort(), [
        ...Object.keys(await inventory(packageRoot)).map((filename) => `mouthfeel/${filename}`),
        ...(catalog ? [catalog] : []),
      ].sort(), `${host}: unexpected files outside the package`);
      if (catalog) {
        const marketplace = await json<Marketplace<string | { source: string; path: string }>>(join(source, host, catalog));
        assert.equal(marketplace.name, "mouthfeel");
        assert.equal(marketplace.plugins.length, 1);
        assert.deepEqual(marketplace.plugins[0]?.source, host === "claude" ? "./mouthfeel" : { source: "local", path: "./mouthfeel" });
      }
      let filename: string;
      if (host === "pi" || host === "opencode") {
        const { stdout } = await exec(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", artifacts], {
          cwd: packageRoot,
          timeout: 120_000,
        });
        const result = JSON.parse(stdout) as { filename: string }[];
        assert.equal(result.length, 1);
        filename = host === "pi" ? `nielsmadan-mouthfeel-pi-${version}.tgz` : `nielsmadan-opencode-mouthfeel-${version}.tgz`;
        assert.equal(result[0]?.filename, filename);
      } else {
        filename = `mouthfeel-${host}-${version}.tgz`;
        await archive(join(source, host), join(artifacts, filename));
      }
      const extracted = join(temporary, `extracted ${host} & package`);
      await unpack(join(artifacts, filename), extracted);
      assert.deepEqual(await inventory(extracted), await inventory(host === "pi" || host === "opencode"
        ? await npmExpectedTree(packageRoot, temporary, host) : join(source, host)), `${host}: archive contents differ from build`);
      const installed = join(extracted, host === "pi" || host === "opencode" ? "package" : "mouthfeel");
      await validatePackage(host, installed, version);
      await smoke(host, installed, temporary);
    }

    const marketplace = join(stage, "marketplace");
    const claude = await json<ClaudeMarketplace>(join(source, "claude/.claude-plugin/marketplace.json"));
    const codex = await json<CodexMarketplace>(join(source, "codex/.agents/plugins/marketplace.json"));
    assert.ok(claude.plugins[0] && codex.plugins[0]);
    claude.plugins[0].source = "./claude/mouthfeel";
    codex.plugins[0].source.path = "./plugins/mouthfeel";
    await writeJson(join(marketplace, ".claude-plugin/marketplace.json"), claude);
    await writeJson(join(marketplace, ".agents/plugins/marketplace.json"), codex);
    await cp(join(source, "claude/mouthfeel"), join(marketplace, "claude/mouthfeel"), { recursive: true });
    await cp(join(source, "codex/mouthfeel"), join(marketplace, "plugins/mouthfeel"), { recursive: true });
    await cp(join(root, "LICENSE"), join(marketplace, "LICENSE"));
    await writeFile(join(marketplace, "README.md"), `# Mouthfeel ${version}\n\nGenerated Claude Code and Codex marketplace.\n\nSee https://github.com/nielsmadan/mouthfeel/blob/v${version}/docs/install.md for installation and usage.\n`);
    await validateMarketplace(marketplace, version);
    const marketplaceArchive = join(artifacts, `mouthfeel-marketplace-${version}.tgz`);
    await archive(marketplace, marketplaceArchive);
    const extractedMarketplace = join(temporary, "extracted-marketplace");
    await unpack(marketplaceArchive, extractedMarketplace);
    assert.deepEqual(await inventory(extractedMarketplace), await inventory(marketplace));
    await validateMarketplace(extractedMarketplace, version);

    const hashes = await inventory(artifacts);
    await writeFile(join(artifacts, "SHA256SUMS"), Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b))
      .map(([filename, hash]) => `${hash}  ${filename}\n`).join(""));
    await writeJson(join(stage, "release.json"), { generator: "mouthfeel-release-v1", version, tag: `v${version}`, artifacts: hashes });
    const destination = join(outputRoot, `v${version}`);
    await publishDirectory(stage, destination);
    return destination;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}

async function npmExpectedTree(packageRoot: string, temporary: string, host: Host): Promise<string> {
  const expected = join(temporary, `expected-${host}`);
  await cp(packageRoot, join(expected, "package"), { recursive: true });
  return expected;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--tag"), "Usage: npm run release:prepare -- [--tag v0.9.0]");
  const root = resolve(scriptRoot, "..");
  await releaseVersion(root, args[1]);
  await runCommand("npm", ["run", "check"], { cwd: root, env: process.env, platform: process.platform, stdio: "inherit" });
  const destination = await prepareRelease(root, args[1]);
  console.log(`Release prepared and validated: ${destination}\nNothing was committed, tagged, installed, or published.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
