import type { StdioOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, runCommandOutput, runDevelopmentCli } from "./dev-common.js";

interface DevelopmentInstallOptions {
  root?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  stdio?: StdioOptions;
}

function agentRoot(env: NodeJS.ProcessEnv): string {
  const override = env.PI_CODING_AGENT_DIR?.trim();
  return override ? resolve(override) : join(homedir(), ".pi", "agent");
}

async function replaceDirectory(source: string, destination: string, signal?: AbortSignal): Promise<void> {
  const token = randomUUID();
  const staging = `${destination}.tmp-${token}`;
  const backup = `${destination}.old-${token}`;
  let backedUp = false;

  await mkdir(dirname(destination), { recursive: true });
  try {
    await cp(source, staging, { recursive: true });
    signal?.throwIfAborted();
    try {
      await rename(destination, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      if (backedUp) await rename(backup, destination);
      throw error;
    }
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function installPiForDevelopment(options: DevelopmentInstallOptions = {}): Promise<string> {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const stdio = options.stdio ?? "inherit";
  const execute = (command: string, args: string[], cwd: string) => runCommand(command, args, {
    cwd,
    env,
    platform,
    ...(options.signal ? { signal: options.signal } : {}),
    stdio,
  });
  const executeForOutput = (command: string, args: string[], cwd: string) => runCommandOutput(command, args, {
    cwd,
    env,
    platform,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  await execute("npm", ["run", "build"], root);
  options.signal?.throwIfAborted();
  const source = join(root, "dist", "pi", "mouthfeel");
  const destination = join(agentRoot(env), "dev-packages", "mouthfeel");
  await replaceDirectory(source, destination, options.signal);
  await execute("pi", ["install", "./mouthfeel"], dirname(destination));
  const installed = await executeForOutput("pi", ["list"], root);
  if (installed.split(/\r?\n/).some((line) => line.trim() === source)) {
    await execute("pi", ["remove", "./mouthfeel"], dirname(source));
  }
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void runDevelopmentCli(
    (signal) => installPiForDevelopment({ signal }),
    (destination) => `Installed Mouthfeel at ${destination}. Restart Pi to load it.`,
  );
}
