import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadProfiles } from "../src/core/load.js";
import { buildEvalJobs, loadEvalCases } from "../src/evals.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profiles = await loadProfiles(join(root, "profiles"));
const cases = await loadEvalCases(join(root, "evals", "cases"));
const jobs = buildEvalJobs(profiles, cases, !process.argv.includes("--all"));
const output = join(root, "evals", "runs", "jobs.jsonl");
await mkdir(join(root, "evals", "runs"), { recursive: true });
await writeFile(output, `${jobs.map((job) => JSON.stringify(job)).join("\n")}\n`);
process.stdout.write(`Prepared ${jobs.length} eval jobs at ${output}\n`);
