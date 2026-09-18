import { parse } from "yaml";

import { INTENSITIES, isIntensity } from "../src/core/types.js";
import { EFFORTS, isEffort } from "./types.js";
import type { HostCase, HostId, Job, RunOptions } from "./types.js";

const hostRecord: Record<HostId, null> = { claude: null, codex: null, pi: null };
const hostIds = Object.keys(hostRecord) as HostId[];

export function isHostId(value: string): value is HostId {
  return (hostIds as string[]).includes(value);
}

export function parseHostCase(source: string, path: string): HostCase {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`host case ${path} is missing yaml frontmatter`);
  }
  const frontmatter = parse(match[1] ?? "") as Record<string, unknown>;
  const id = frontmatter["id"];
  const type = frontmatter["type"];
  const profiles = frontmatter["profiles"];
  const intensities = frontmatter["intensities"];
  if (typeof id !== "string" || id === "") {
    throw new Error(`host case ${path} is missing id`);
  }
  if (
    !Array.isArray(profiles) ||
    profiles.length === 0 ||
    !profiles.every((p): p is string => typeof p === "string")
  ) {
    throw new Error(`host case ${path} needs a non-empty profiles list`);
  }
  if (
    !Array.isArray(intensities) ||
    intensities.length === 0 ||
    !intensities.every(isIntensity)
  ) {
    throw new Error(`host case ${path} needs intensities of ${INTENSITIES.join(" or ")}`);
  }
  const setup = frontmatter["setup"];
  if (setup !== undefined && (typeof setup !== "string" || !/^[a-z0-9-]+$/.test(setup))) {
    throw new Error(`host case ${path} setup must be a kebab-case fixture name`);
  }
  const turns = (match[2] ?? "")
    .split(/^---turn---$/m)
    .map((turn) => turn.trim());
  if (turns.some((turn) => turn === "")) {
    throw new Error(`host case ${path} has an empty body or empty turn`);
  }
  return {
    id,
    path,
    type: typeof type === "string" ? type : "unspecified",
    profiles,
    intensities,
    setup: typeof setup === "string" ? setup : undefined,
    turns,
  };
}

export function expandMatrix(options: RunOptions, cases: HostCase[]): Job[] {
  const jobs: Job[] = [];
  const pattern = options.casePattern;
  const selected = pattern ? cases.filter((c) => c.id.includes(pattern)) : cases;
  const runs = Math.max(1, options.runs);
  for (const host of options.hosts) {
    for (const hostCase of selected) {
      if (options.control) {
        for (let run = 1; run <= runs; run++) {
          jobs.push({ host, caseId: hostCase.id, profile: "control", intensity: 0, run });
        }
        continue;
      }
      const profiles = options.profiles ?? hostCase.profiles;
      const intensities = options.intensities ?? hostCase.intensities;
      for (const profile of profiles) {
        for (const intensity of intensities) {
          for (let run = 1; run <= runs; run++) {
            jobs.push({ host, caseId: hostCase.id, profile, intensity, run });
          }
        }
      }
    }
  }
  return jobs;
}

export function jobDirName(job: Job): string {
  const base = `${job.host}-${job.caseId}-${job.profile}-${job.intensity}`;
  return job.run > 1 ? `${base}-run${job.run}` : base;
}

export function workerName(prefix: string, job: Job, index: number): string {
  return `${prefix}-${job.host}-${index}`;
}

export function pickNewestVersion(versions: string[]): string | undefined {
  const sorted = [...versions].sort((a, b) => {
    const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  return sorted[0];
}

export function shimScript(wrappedCommand: string, preExec?: string): string {
  const head = `#!/bin/zsh\nsource ~/.zshrc >/dev/null 2>&1 || true\n`;
  const body = preExec ? `${preExec}\n` : "";
  return `${head}${body}exec ${wrappedCommand} "$@"\n`;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// Pane text still contains the activation line, so profile/intensity alone
// always match; a second "Mouthfeel:" line is the status reply itself.
export function statusPaneMatches(paneText: string, profile: string, intensity: number): boolean {
  const mentions = paneText.split("Mouthfeel:").length - 1;
  return mentions >= 2 && statusReplyMatches(paneText, profile, intensity);
}

export function statusReplyMatches(reply: string, profile: string, intensity: number): boolean {
  return reply.includes(profile) && reply.includes(String(intensity));
}

export function parseRunArgs(argv: string[]): RunOptions {
  const options: RunOptions = {
    hosts: [...hostIds],
    casePattern: undefined,
    profiles: undefined,
    intensities: undefined,
    model: undefined,
    effort: undefined,
    runs: 1,
    control: false,
    dryRun: false,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--host": {
        const hosts = next()
          .split(",")
          .map((h) => h.trim())
          .filter((h) => h !== "")
          .map((h) => {
            if (!isHostId(h)) throw new Error(`unknown host ${h}`);
            return h;
          });
        options.hosts = hosts;
        break;
      }
      case "--case":
        options.casePattern = next();
        break;
      case "--profile": {
        const profiles = next()
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p !== "");
        if (profiles.length === 0) throw new Error("--profile needs at least one profile id");
        options.profiles = profiles;
        break;
      }
      case "--intensity": {
        const intensities = next()
          .split(",")
          .map((raw) => Number.parseInt(raw.trim(), 10));
        if (intensities.length === 0 || !intensities.every(isIntensity)) {
          throw new Error(`--intensity must be a comma list of ${INTENSITIES.join(" or ")}`);
        }
        options.intensities = intensities;
        break;
      }
      case "--model":
        options.model = next();
        break;
      case "--effort": {
        const value = next();
        if (!isEffort(value)) {
          throw new Error(`--effort must be one of ${EFFORTS.join(", ")}`);
        }
        options.effort = value;
        break;
      }
      case "--runs": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isInteger(value) || value < 1) throw new Error("--runs must be a positive integer");
        options.runs = value;
        break;
      }
      case "--control":
        options.control = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--keep":
        options.keep = true;
        break;
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }
  return options;
}
