import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { baselinesDir } from "./config.js";
import { cellKey, collect } from "./collect.js";

// Bumped when the meaning of intensity values changes; joins across scales
// compare different levels and must be refused.
export const BASELINE_SCALE = 2;

export interface BaselineRow {
  scale: number;
  cell: string;
  host: string;
  model: string;
  caseId: string;
  profile: string;
  intensity: number;
  reply: string;
}

export function baselinePath(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`baseline name ${name} must use letters, digits, dot, dash, underscore`);
  }
  return join(baselinesDir, `${name}.jsonl`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const nameArg = args.find((a) => a.startsWith("--name="));
  const runDirs = args.filter((a) => !a.startsWith("--"));
  if (!nameArg || runDirs.length === 0) {
    console.error("usage: tsx harness/baseline.ts --name=<baseline-name> <run-dir-name...>");
    process.exitCode = 1;
    return;
  }
  const name = nameArg.slice("--name=".length);
  const entries = await collect(runDirs);
  const rows = entries
    .filter((e) => e.run === 1)
    .map(
      (e): BaselineRow => ({
        scale: BASELINE_SCALE,
        cell: cellKey(e),
        host: e.host,
        model: e.model,
        caseId: e.caseId,
        profile: e.profile,
        intensity: e.intensity,
        reply: e.reply,
      }),
    );
  await mkdir(baselinesDir, { recursive: true });
  const out = baselinePath(name);
  await writeFile(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`wrote ${out} with ${rows.length} cells`);
}

if (process.argv[1]?.endsWith("baseline.ts")) await main();
