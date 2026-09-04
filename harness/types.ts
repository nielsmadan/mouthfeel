export type HostId = "claude" | "codex" | "pi";

export interface HostCase {
  id: string;
  path: string;
  type: string;
  profiles: string[];
  intensities: number[];
  body: string;
}

export interface Job {
  host: HostId;
  caseId: string;
  profile: string;
  intensity: number;
  run: number;
}

export interface RunOptions {
  hosts: HostId[];
  casePattern: string | undefined;
  profiles: string[] | undefined;
  intensities: number[] | undefined;
  model: string | undefined;
  runs: number;
  dryRun: boolean;
  keep: boolean;
}

export interface WorkerHandle {
  name: string;
  shimPath: string;
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
  shimPreExec(): string | undefined;
  stage(): Promise<void>;
  harnessArgs(model: string | undefined): string[];
  launchEnv(model: string | undefined): Record<string, string>;
  activation(profile: string, intensity: number): string;
  status(): string;
}
