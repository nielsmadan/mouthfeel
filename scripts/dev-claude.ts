import type { StdioOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, runCommandOutput, runDevelopmentCli } from "./dev-common.js";

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

export async function installClaudeForDevelopment(options: DevelopmentInstallOptions = {}): Promise<string> {
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
  const executeForOutput = (command: string, args: string[]) => runCommandOutput(command, args, {
    cwd: root,
    env,
    platform,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  await execute("npm", ["run", "build"]);

  const manifestPath = join(root, "dist", "claude", "mouthfeel", ".claude-plugin", "plugin.json");
  const originalManifest = await readFile(manifestPath);
  const manifest = JSON.parse(originalManifest.toString("utf8")) as Record<string, unknown>;
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error(`${manifestPath} must contain a non-empty string version`);
  }
  const version = `${manifest.version.split("+", 1)[0]}+claude.local-${timestamp(options.now ?? new Date())}-${randomUUID()}`;
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let updateError: unknown;
  let restoreError: unknown;
  try {
    await execute("claude", ["plugin", "update", "mouthfeel@mouthfeel", "--scope", "user"]);
    const installed = JSON.parse(await executeForOutput("claude", ["plugin", "list", "--json"])) as unknown;
    const enabled = Array.isArray(installed) && installed.some((entry) => (
      entry !== null
      && typeof entry === "object"
      && (entry as Record<string, unknown>).id === "mouthfeel@mouthfeel"
      && (entry as Record<string, unknown>).scope === "user"
      && (entry as Record<string, unknown>).enabled === true
    ));
    if (!enabled) await execute("claude", ["plugin", "enable", "mouthfeel@mouthfeel", "--scope", "user"]);
  } catch (error) {
    updateError = error;
  } finally {
    try {
      await writeFile(manifestPath, originalManifest);
    } catch (error) {
      restoreError = error;
    }
  }
  if (updateError && restoreError) {
    throw new AggregateError([updateError, restoreError], "Claude update and manifest restoration both failed");
  }
  if (restoreError) throw restoreError;
  if (updateError) throw updateError;
  return version;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void runDevelopmentCli(
    (signal) => installClaudeForDevelopment({ signal }),
    (version) => `Updated Mouthfeel ${version}. Run /reload-plugins in Claude or start a new session.`,
  );
}
