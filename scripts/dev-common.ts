import { spawn } from "node:child_process";
import type { StdioOptions } from "node:child_process";

interface DevelopmentCliHost {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
  exitCode?: string | number | null | undefined;
}

export function shellForPlatform(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

export function runCommand(command: string, args: string[], options: {
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

export function runCommandOutput(command: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  signal?: AbortSignal;
}): Promise<string> {
  return new Promise((fulfill, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: shellForPlatform(options.platform),
      ...(options.signal ? { signal: options.signal } : {}),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", (error) => reject(new Error(`Failed to start ${command}: ${error.message}`, { cause: error })));
    child.once("close", (code) => {
      if (code === 0) fulfill(Buffer.concat(stdout).toString("utf8"));
      else {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}${detail ? `: ${detail}` : ""}`));
      }
    });
  });
}

export async function runDevelopmentCli<T>(
  install: (signal: AbortSignal) => Promise<T>,
  success: (result: T) => string,
  host: DevelopmentCliHost = process,
): Promise<void> {
  const controller = new AbortController();
  let interrupted: "SIGINT" | "SIGTERM" | null = null;
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    interrupted = signal;
    controller.abort();
  };
  const onInterrupt = () => interrupt("SIGINT");
  const onTerminate = () => interrupt("SIGTERM");
  host.once("SIGINT", onInterrupt);
  host.once("SIGTERM", onTerminate);
  try {
    const result = await install(controller.signal);
    host.stdout.write(`${success(result)}\n`);
  } catch (error) {
    host.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    host.exitCode = interrupted === "SIGINT" ? 130 : interrupted === "SIGTERM" ? 143 : 1;
  } finally {
    host.off("SIGINT", onInterrupt);
    host.off("SIGTERM", onTerminate);
  }
}
