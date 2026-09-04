import { activationTemplates, distDirs, statusTemplates } from "../config.js";
import { piInstallPreExec } from "../lib.js";
import type { HostAdapter } from "../types.js";

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
