import { activationTemplates, distDirs, statusTemplates } from "../config.js";
import { shellQuote } from "../lib.js";
import type { Effort, HostAdapter, ShimContext } from "../types.js";

export function codexInstallPreExec(distDir: string, effort?: Effort): string {
  const lines = [
    'if [ -n "$CODEX_HOME" ]; then',
    `  codex plugin marketplace add ${shellQuote(distDir)} >/dev/null 2>&1 || true`,
    "  codex plugin add mouthfeel@mouthfeel >/dev/null || exit 70",
    "fi",
  ];
  if (effort) {
    // csd pins model_reasoning_effort = "low" in the staged config.toml and only
    // forwards CSD_* env into the session, so the effort is baked in literally.
    lines.push(
      'if [ -n "$CODEX_HOME" ] && [ -f "$CODEX_HOME/config.toml" ]; then',
      `  sed -i '' 's/^model_reasoning_effort *=.*/model_reasoning_effort = "${effort}"/' "$CODEX_HOME/config.toml"`,
      '  grep -q "^model_reasoning_effort = \\"' + effort + '\\"" "$CODEX_HOME/config.toml" || exit 71',
      "fi",
    );
  }
  return lines.join("\n");
}

export const codexHost: HostAdapter = {
  id: "codex",
  binEnvVar: "CSD_CODEX_BIN",
  wrappedCommand: "codex",
  commandsConfirmAsTurns: true,
  postLaunchSettleMs: 0,
  sendSettleMs: 0,
  shimPreExec(context: ShimContext) {
    return codexInstallPreExec(distDirs.codex, context.effort);
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
