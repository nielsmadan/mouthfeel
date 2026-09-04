import { activationTemplates, distDirs, statusTemplates } from "../config.js";
import type { HostAdapter } from "../types.js";

export const claudeHost: HostAdapter = {
  id: "claude",
  binEnvVar: "CSD_CLAUDE_BIN",
  wrappedCommand: "claude",
  commandsConfirmAsTurns: true,
  postLaunchSettleMs: 0,
  sendSettleMs: 0,
  shimPreExec() {
    return undefined;
  },
  async stage() {},
  harnessArgs(model) {
    const args = ["--plugin-dir", distDirs.claude];
    if (model) args.push("--model", model);
    return args;
  },
  launchEnv() {
    return {};
  },
  activation(profile, intensity) {
    return activationTemplates.claude(profile, intensity);
  },
  status() {
    return statusTemplates.claude();
  },
};
