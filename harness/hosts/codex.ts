import { activationTemplates, distDirs, statusTemplates } from "../config.js";
import { codexInstallPreExec } from "../lib.js";
import type { HostAdapter } from "../types.js";

export const codexHost: HostAdapter = {
  id: "codex",
  binEnvVar: "CSD_CODEX_BIN",
  wrappedCommand: "codex",
  commandsConfirmAsTurns: true,
  postLaunchSettleMs: 0,
  sendSettleMs: 0,
  shimPreExec() {
    return codexInstallPreExec(distDirs.codex);
  },
  async stage() {},
  harnessArgs() {
    return [];
  },
  launchEnv(model) {
    return model ? { CSD_CODEX_MODEL: model } : {};
  },
  activation(profile, intensity) {
    return activationTemplates.codex(profile, intensity);
  },
  status() {
    return statusTemplates.codex();
  },
};
