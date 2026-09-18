import type { Intensity } from "../src/core/types.js";

export type HostId = "claude" | "codex" | "pi";

export const EFFORTS = ["minimal", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];

export function isEffort(value: unknown): value is Effort {
  return (EFFORTS as readonly unknown[]).includes(value);
}

export interface HostCase {
  id: string;
  path: string;
  type: string;
  profiles: string[];
  intensities: Intensity[];
  // Fixture directory under evals/fixtures copied into the job workspace.
  setup: string | undefined;
  // Conversation turns; the final turn's reply is the judged output.
  turns: string[];
}

export interface Job {
  host: HostId;
  caseId: string;
  profile: string;
  // Styled jobs use Intensity values; the control arm is 0.
  intensity: number;
  run: number;
}

export interface RunOptions {
  hosts: HostId[];
  casePattern: string | undefined;
  profiles: string[] | undefined;
  intensities: Intensity[] | undefined;
  model: string | undefined;
  effort: Effort | undefined;
  runs: number;
  control: boolean;
  dryRun: boolean;
  keep: boolean;
}

export interface WorkerHandle {
  name: string;
  shimPath: string;
}

export interface ShimContext {
  effort: Effort | undefined;
}

export interface HostAdapter {
  id: HostId;
  binEnvVar: string;
  wrappedCommand: string;
  // Plugin commands (activation, status) enter a model turn csd can confirm on
  // claude/codex, but are synchronous extension responses on pi that never go
  // "busy"; those are delivered fire-and-forget and read back from the pane.
  commandsConfirmAsTurns: boolean;
  // Cold workers that bootstrap on boot (pi clones marketplaces) need a settle
  // before the first command lands on a ready composer.
  postLaunchSettleMs: number;
  // Settle after a fire-and-forget send before scraping the pane for the reply.
  sendSettleMs: number;
  shimPreExec(context: ShimContext): string | undefined;
  stage(): Promise<void>;
  harnessArgs(model: string | undefined): string[];
  launchEnv(model: string | undefined): Record<string, string>;
  activation(profile: string, intensity: number): string;
  status(): string;
}
