import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StdioOptions } from "node:child_process";

import { runCommand, runDevelopmentCli } from "./dev-common.js";
export { shellForPlatform } from "./dev-common.js";

interface DevelopmentInstallOptions {
  root?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  stdio?: StdioOptions;
}

function timestamp(now: Date): string {
  const compact = now.toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "");
  return `${compact.slice(0, 8)}-${compact.slice(9)}`;
}

function cachebustedVersion(version: string, now: Date): string {
  return `${version.split("+", 1)[0]}+codex.local-${timestamp(now)}`;
}

export async function installCodexForDevelopment(options: DevelopmentInstallOptions = {}): Promise<string> {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const stdio = options.stdio ?? "inherit";
  const execute = (command: string, args: string[]) => runCommand(command, args, {
    cwd: root,
    env,
    platform,
    ...(options.signal ? { signal: options.signal } : {}),
    stdio,
  });
  await execute("npm", ["run", "build"]);

  const manifestPath = join(root, "dist", "codex", "mouthfeel", ".codex-plugin", "plugin.json");
  const originalManifest = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifest.toString("utf8")) as Record<string, unknown>;
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error(`${manifestPath} must contain a non-empty string version`);
  }
  const version = cachebustedVersion(manifest.version, options.now ?? new Date());
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let installError: unknown;
  let restoreError: unknown;
  try {
    await execute("codex", ["plugin", "add", "mouthfeel@mouthfeel"]);
  } catch (error) {
    installError = error;
  } finally {
    try {
      await writeFile(manifestPath, originalManifest);
    } catch (error) {
      restoreError = error;
    }
  }
  if (installError && restoreError) {
    throw new AggregateError([installError, restoreError], "Codex installation and manifest restoration both failed");
  }
  if (restoreError) throw restoreError;
  if (installError) throw installError;
  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void runDevelopmentCli(
    (signal) => installCodexForDevelopment({ signal }),
    (version) => `Installed Mouthfeel ${version}. Start a new Codex thread to load it.`,
  );
}
