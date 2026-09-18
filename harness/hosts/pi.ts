import { activationTemplates, distDirs, statusTemplates } from "../config.js";
import { shellQuote } from "../lib.js";
import type { HostAdapter } from "../types.js";

export function piInstallPreExec(distDir: string): string {
  return [
    'if [ -n "$PI_CODING_AGENT_DIR" ]; then',
    `  pi install ${shellQuote(distDir)} >/dev/null || exit 70`,
    "fi",
  ].join("\n");
}

export const piHost: HostAdapter = {
  id: "pi",
  binEnvVar: "CSD_PI_BIN",
  wrappedCommand: "pi",
  commandsConfirmAsTurns: false,
  postLaunchSettleMs: 75_000,
  sendSettleMs: 10_000,
  shimPreExec() {
    return piInstallPreExec(distDirs.pi);
  },
  async stage() {},
  harnessArgs() {
    return [];
  },
  launchEnv(model) {
    return model ? { CSD_PI_MODEL: model } : {};
  },
  activation(profile, intensity) {
    return activationTemplates.pi(profile, intensity);
  },
  status() {
    return statusTemplates.pi();
  },
};
