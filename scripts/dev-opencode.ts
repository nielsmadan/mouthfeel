import type { StdioOptions } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, runDevelopmentCli } from "./dev-common.js";

interface DevelopmentInstallOptions {
  root?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  stdio?: StdioOptions;
}

function configRoot(env: NodeJS.ProcessEnv): string {
  const override = env.OPENCODE_CONFIG_DIR?.trim();
  if (override) return resolve(override);
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(resolve(xdg), "opencode");
  return join(homedir(), ".config", "opencode");
}

export async function installOpenCodeForDevelopment(options: DevelopmentInstallOptions = {}): Promise<string> {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  await runCommand("npm", ["run", "build"], {
    cwd: root,
    env,
    platform,
    ...(options.signal ? { signal: options.signal } : {}),
    stdio: options.stdio ?? "inherit",
  });

  options.signal?.throwIfAborted();
  const source = join(root, "dist", "opencode", "mouthfeel", "index.js");
  const destination = join(configRoot(env), "plugins", "mouthfeel.js");
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void runDevelopmentCli(
    (signal) => installOpenCodeForDevelopment({ signal }),
    (destination) => `Installed Mouthfeel at ${destination}. Restart OpenCode to load it.`,
  );
}
