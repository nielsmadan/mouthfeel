import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StdioOptions } from "node:child_process";

interface DevelopmentInstallOptions {
  root?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  stdio?: StdioOptions;
}

export function shellForPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

function run(command: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  signal?: AbortSignal;
  stdio: StdioOptions;
}): Promise<void> {
  return new Promise((fulfill, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: shellForPlatform(options.platform),
      ...(options.signal ? { signal: options.signal } : {}),
      stdio: options.stdio,
    });
    child.stdout?.resume();
    child.stderr?.resume();
    child.once("error", (error) => reject(new Error(`Failed to start ${command}: ${error.message}`, { cause: error })));
    child.once("close", (code) => {
      if (code === 0) fulfill();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
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
  const execute = (command: string, args: string[]) => run(command, args, {
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

async function main(): Promise<void> {
  const controller = new AbortController();
  let interrupted: "SIGINT" | "SIGTERM" | null = null;
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    interrupted = signal;
    controller.abort();
  };
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);
  try {
    const version = await installCodexForDevelopment({ signal: controller.signal });
    process.stdout.write(`Installed Mouthfeel ${version}. Start a new Codex thread to load it.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
