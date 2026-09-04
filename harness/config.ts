import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HostId } from "./types.js";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const hostCasesDir = join(repoRoot, "evals", "host-cases");
export const artifactRoot = join(repoRoot, "evals", "runs", "host-smoke");

export const distDirs: Record<HostId, string> = {
  claude: join(repoRoot, "dist", "claude", "mouthfeel"),
  codex: join(repoRoot, "dist", "codex"),
  pi: join(repoRoot, "dist", "pi", "mouthfeel"),
};

export const activationTemplates: Record<HostId, (profile: string, intensity: number) => string> = {
  claude: (profile, intensity) => `/mouthfeel:use ${profile} ${intensity}`,
  codex: (profile, intensity) => `$mouthfeel:use ${profile} ${intensity}`,
  pi: (profile, intensity) => `/mouthfeel ${profile} ${intensity}`,
};

export const statusTemplates: Record<HostId, () => string> = {
  claude: () => "/mouthfeel:use status",
  codex: () => "$mouthfeel:use status",
  pi: () => "/mouthfeel status",
};

export const converseTimeoutsSeconds = {
  activation: 300,
  status: 180,
  caseTurn: 600,
};

export const workerNamePrefix = "mf-smoke";

export const csdCacheGlobRoot = join(
  process.env["HOME"] ?? "",
  ".claude",
  "plugins",
  "cache",
  "superpowers-marketplace",
  "claude-session-driver",
);

export const csdConsentPath = join(process.env["HOME"] ?? "", ".claude", ".claude-session-driver-consent");
