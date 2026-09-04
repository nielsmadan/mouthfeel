import { parse } from "yaml";

import type { HostCase, HostId, Job, RunOptions } from "./types.js";

const hostIds: HostId[] = ["claude", "codex", "pi"];

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
  if (!Array.isArray(profiles) || profiles.length === 0 || !profiles.every((p) => typeof p === "string")) {
    throw new Error(`host case ${path} needs a non-empty profiles list`);
  }
  if (
    !Array.isArray(intensities) ||
    intensities.length === 0 ||
    !intensities.every((i) => typeof i === "number" && [1, 2, 3].includes(i))
  ) {
    throw new Error(`host case ${path} needs intensities from 1-3`);
  }
  const body = (match[2] ?? "").trim();
  if (body === "") {
    throw new Error(`host case ${path} has an empty body`);
  }
  return {
    id,
    path,
    type: typeof type === "string" ? type : "unspecified",
    profiles: profiles as string[],
    intensities: intensities as number[],
    body,
  };
}

export function expandMatrix(options: RunOptions, cases: HostCase[]): Job[] {
  const jobs: Job[] = [];
  const selected = options.casePattern
    ? cases.filter((c) => c.id.includes(options.casePattern as string))
    : cases;
  const runs = Math.max(1, options.runs);
  for (const host of options.hosts) {
    for (const hostCase of selected) {
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

export function codexInstallPreExec(distDir: string): string {
  return [
    'if [ -n "$CODEX_HOME" ]; then',
    `  codex plugin marketplace add ${distDir} >/dev/null 2>&1 || true`,
    "  codex plugin add mouthfeel@mouthfeel >/dev/null 2>&1 || true",
    "fi",
  ].join("\n");
}

export function piInstallPreExec(distDir: string): string {
  return [
    'if [ -n "$PI_CODING_AGENT_DIR" ]; then',
    `  pi install ${distDir} >/dev/null 2>&1 || true`,
    "fi",
  ].join("\n");
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
    runs: 1,
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
          .filter((h) => h !== "");
        for (const host of hosts) {
          if (!isHostId(host)) throw new Error(`unknown host ${host}`);
        }
        options.hosts = hosts as HostId[];
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
        if (intensities.length === 0 || !intensities.every((v) => [1, 2, 3].includes(v))) {
          throw new Error("--intensity must be a comma list of 1, 2, or 3");
        }
        options.intensities = intensities;
        break;
      }
      case "--model":
        options.model = next();
        break;
      case "--runs": {
        const value = Number.parseInt(next(), 10);
        if (!Number.isInteger(value) || value < 1) throw new Error("--runs must be a positive integer");
        options.runs = value;
        break;
      }
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
