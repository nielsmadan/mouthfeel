import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { csdCacheGlobRoot } from "./config.js";
import { pickNewestVersion } from "./lib.js";
import type { HostId, WorkerHandle } from "./types.js";

const execFileAsync = promisify(execFile);

const csdRelativeBinary = join("skills", "driving-claude-code-sessions", "scripts", "csd");

export async function resolveCsd(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const override = env["CSD_BIN"];
  if (override) return override;
  let versions: string[];
  try {
    versions = await readdir(csdCacheGlobRoot);
  } catch {
    throw new Error(
      "csd not found: install claude-session-driver@superpowers-marketplace or set CSD_BIN",
    );
  }
  const newest = pickNewestVersion(versions);
  if (!newest) throw new Error("csd cache directory is empty; set CSD_BIN");
  const candidate = join(csdCacheGlobRoot, newest, csdRelativeBinary);
  await stat(candidate);
  return candidate;
}

export interface LaunchRequest {
  csdBinary: string;
  harness: HostId;
  name: string;
  cwd: string;
  harnessArgs: string[];
  env: Record<string, string>;
}

export async function launchWorker(request: LaunchRequest): Promise<WorkerHandle> {
  const args = ["launch", "--harness", request.harness, request.name, request.cwd];
  if (request.harnessArgs.length > 0) args.push("--", ...request.harnessArgs);
  const { stdout } = await execFileAsync(request.csdBinary, args, {
    env: { ...process.env, ...request.env },
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const shimPath = stdout.trim().split("\n")[0];
  if (!shimPath) throw new Error(`csd launch for ${request.name} printed no shim path`);
  return { name: request.name, shimPath };
}

async function runShim(
  worker: WorkerHandle,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  const { stdout } = await execFileAsync(worker.shimPath, args, {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function converse(worker: WorkerHandle, prompt: string, timeoutSeconds: number): Promise<string> {
  return (await runShim(worker, ["converse", prompt, String(timeoutSeconds)], (timeoutSeconds + 30) * 1000)).trim();
}

// Fire-and-forget: csd `send` warns (and this may reject) when it cannot confirm
// submission, but the keystroke still lands for a synchronous plugin command, so
// the caller reads the effect back from the pane instead of a returned turn.
export async function sendNoWait(worker: WorkerHandle, prompt: string): Promise<void> {
  try {
    await runShim(worker, ["send", prompt], 60_000);
  } catch {
    // submission-confirm failures are expected for non-turn plugin commands
  }
}

export async function readTurn(worker: WorkerHandle): Promise<string> {
  return runShim(worker, ["read-turn", "--full"], 60_000);
}

export async function eventsFilePath(worker: WorkerHandle): Promise<string> {
  return (await runShim(worker, ["events-file"], 30_000)).trim();
}

export async function stopWorker(worker: WorkerHandle): Promise<void> {
  try {
    await runShim(worker, ["stop"], 60_000);
  } catch {
    // best-effort: the worker may already be gone
  }
}

export async function capturePane(sessionName: string, lines = 60): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", ["capture-pane", "-p", "-t", sessionName, "-S", `-${lines}`], {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    return `pane capture failed: ${String(error)}`;
  }
}

export async function tmuxServerReachable(): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["ls"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
