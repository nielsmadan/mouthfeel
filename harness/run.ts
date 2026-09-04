import { execFile } from "node:child_process";
import { access, chmod, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  artifactRoot,
  converseTimeoutsSeconds,
  csdConsentPath,
  hostCasesDir,
  repoRoot,
  workerNamePrefix,
} from "./config.js";
import {
  capturePane,
  converse,
  eventsFilePath,
  launchWorker,
  readTurn,
  resolveCsd,
  sendNoWait,
  stopWorker,
  tmuxServerReachable,
} from "./driver.js";
import { hostAdapters } from "./hosts/index.js";
import { expandMatrix, jobDirName, parseHostCase, parseRunArgs, shimScript, statusReplyMatches, workerName } from "./lib.js";
import type { HostAdapter, HostCase, Job, WorkerHandle } from "./types.js";

const execFileAsync = promisify(execFile);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// A plugin command (activation, status) is a model turn on some hosts and a
// synchronous extension response on others. Return the reply either way: from
// csd converse where the turn confirms, or from the pane after a settle where it
// does not.
async function deliverCommand(
  worker: WorkerHandle,
  adapter: HostAdapter,
  text: string,
  timeoutSeconds: number,
): Promise<string> {
  if (adapter.commandsConfirmAsTurns) {
    return converse(worker, text, timeoutSeconds);
  }
  await sendNoWait(worker, text);
  await sleep(adapter.sendSettleMs);
  return capturePane(worker.name, 40);
}

interface JobResult {
  job: Job;
  status: "passed" | "failed";
  error: string | undefined;
  timingsMs: Record<string, number>;
}

async function loadCases(): Promise<HostCase[]> {
  const entries = (await readdir(hostCasesDir)).filter((e) => e.endsWith(".md")).sort();
  const cases: HostCase[] = [];
  for (const entry of entries) {
    const path = join(hostCasesDir, entry);
    cases.push(parseHostCase(await readFile(path, "utf8"), path));
  }
  return cases;
}

async function preflight(jobs: Job[], runDir: string): Promise<{ csdBinary: string; shims: Map<string, string> }> {
  if (!(await tmuxServerReachable())) {
    throw new Error(
      "no tmux server reachable. Start one from a regular (unsandboxed) shell first: tmux new-session -d -s keepalive",
    );
  }
  // pi's composer submits via a modified Enter that only registers when the tmux
  // server negotiates extended keys in csi-u form; without this its turns paste
  // but never submit. Harmless for the other hosts.
  if (jobs.some((j) => j.host === "pi")) {
    await execFileAsync("tmux", ["set", "-g", "extended-keys", "on"]).catch(() => {});
    await execFileAsync("tmux", ["set", "-g", "extended-keys-format", "csi-u"]).catch(() => {});
  }
  const csdBinary = await resolveCsd();
  try {
    await access(csdConsentPath);
  } catch {
    throw new Error(`csd consent missing; run: ${csdBinary} grant-consent`);
  }
  console.log("preflight: building packages");
  await execFileAsync("npm", ["run", "build"], { cwd: repoRoot, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });

  const shims = new Map<string, string>();
  const shimDir = join(runDir, "shims");
  await mkdir(shimDir, { recursive: true });
  const hosts = [...new Set(jobs.map((j) => j.host))];
  for (const host of hosts) {
    const adapter = hostAdapters[host];
    const shimPath = join(shimDir, `${host}-wrapped.sh`);
    await writeFile(shimPath, shimScript(adapter.wrappedCommand, adapter.shimPreExec()));
    await chmod(shimPath, 0o755);
    shims.set(host, shimPath);
    console.log(`preflight: staging plugin for ${host}`);
    await adapter.stage();
  }
  return { csdBinary, shims };
}

async function writeDiagnostics(jobDir: string, worker: WorkerHandle | undefined, error: unknown): Promise<void> {
  const parts = [`error: ${error instanceof Error ? error.message : String(error)}`];
  if (worker) {
    parts.push("", "=== pane (last 60 lines) ===", await capturePane(worker.name));
    try {
      const events = await readFile(await eventsFilePath(worker), "utf8");
      parts.push("=== events tail ===", events.split("\n").slice(-15).join("\n"));
    } catch {
      parts.push("=== events unavailable ===");
    }
  }
  await writeFile(join(jobDir, "diagnostics.txt"), parts.join("\n"));
}

async function runJob(
  job: Job,
  index: number,
  hostCase: HostCase,
  runDir: string,
  csdBinary: string,
  shims: Map<string, string>,
  model: string | undefined,
  keep: boolean,
): Promise<JobResult> {
  const adapter = hostAdapters[job.host];
  const jobDir = join(runDir, jobDirName(job));
  await mkdir(jobDir, { recursive: true });
  const workspace = join(runDir, "workspace");
  await mkdir(workspace, { recursive: true });

  const timingsMs: Record<string, number> = {};
  let worker: WorkerHandle | undefined;
  try {
    const shim = shims.get(job.host);
    if (!shim) throw new Error(`no shim generated for ${job.host}`);
    const launchStart = Date.now();
    worker = await launchWorker({
      csdBinary,
      harness: job.host,
      name: workerName(workerNamePrefix, job, index),
      cwd: workspace,
      harnessArgs: adapter.harnessArgs(model),
      env: { [adapter.binEnvVar]: shim, ...adapter.launchEnv(model) },
    });
    timingsMs["launch"] = Date.now() - launchStart;

    if (adapter.postLaunchSettleMs > 0) await sleep(adapter.postLaunchSettleMs);

    const activationStart = Date.now();
    const greeting = await deliverCommand(
      worker,
      adapter,
      adapter.activation(job.profile, job.intensity),
      converseTimeoutsSeconds.activation,
    );
    timingsMs["activation"] = Date.now() - activationStart;
    await writeFile(join(jobDir, "greeting.md"), greeting + "\n");

    const statusStart = Date.now();
    const statusReply = await deliverCommand(worker, adapter, adapter.status(), converseTimeoutsSeconds.status);
    timingsMs["status"] = Date.now() - statusStart;
    if (!statusReplyMatches(statusReply, job.profile, job.intensity)) {
      throw new Error(`status assertion failed; reply was: ${statusReply.slice(0, 200)}`);
    }

    const caseStart = Date.now();
    const reply = await converse(worker, hostCase.body, converseTimeoutsSeconds.caseTurn);
    timingsMs["case"] = Date.now() - caseStart;
    await writeFile(join(jobDir, "reply.md"), reply + "\n");
    await writeFile(join(jobDir, "turn.md"), await readTurn(worker));
    try {
      await copyFile(await eventsFilePath(worker), join(jobDir, "events.jsonl"));
    } catch {
      // events are diagnostics, not evidence; a missing file must not fail the job
    }

    await writeFile(
      join(jobDir, "meta.json"),
      JSON.stringify(
        {
          host: job.host,
          caseId: job.caseId,
          profile: job.profile,
          intensity: job.intensity,
          model: model ?? "host-default",
          timingsMs,
          ranAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    return { job, status: "passed", error: undefined, timingsMs };
  } catch (error) {
    await writeDiagnostics(jobDir, worker, error);
    return {
      job,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      timingsMs,
    };
  } finally {
    if (worker && !keep) await stopWorker(worker);
  }
}

async function writeIndex(runDir: string, results: JobResult[]): Promise<void> {
  const lines = ["# Host-smoke run", "", `Run directory: ${runDir}`, ""];
  for (const result of results) {
    const dir = jobDirName(result.job);
    const marker = result.status === "passed" ? "PASS" : "FAIL";
    const suffix = result.error ? ` — ${result.error}` : "";
    lines.push(`- ${marker} [${dir}](${dir}/)${suffix}`);
  }
  lines.push("", "Judge each PASS against evals/RUBRIC.md before promoting anything to references.");
  await writeFile(join(runDir, "index.md"), lines.join("\n") + "\n");
}

async function main(): Promise<void> {
  // csd's submit-confirm gate (default 10s) expires while a cold worker is still
  // doing first-run setup (pi clones marketplaces on boot); give it room. Fast
  // hosts close the gate on confirmation, so a high ceiling costs them nothing.
  if (!process.env["CSD_SUBMIT_TIMEOUT"]) process.env["CSD_SUBMIT_TIMEOUT"] = "120";
  const options = parseRunArgs(process.argv.slice(2));
  const cases = await loadCases();
  const jobs = expandMatrix(options, cases);
  if (jobs.length === 0) {
    console.error("no jobs matched the given filters");
    process.exitCode = 1;
    return;
  }
  console.log(`planned jobs (${jobs.length}):`);
  for (const job of jobs) console.log(`  ${jobDirName(job)}`);
  if (options.dryRun) return;

  const caseById = new Map(cases.map((c) => [c.id, c]));
  const runDir = join(artifactRoot, new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(runDir, { recursive: true });
  const { csdBinary, shims } = await preflight(jobs, runDir);

  const results: JobResult[] = [];
  for (const [index, job] of jobs.entries()) {
    console.log(`job ${index + 1}/${jobs.length}: ${jobDirName(job)}`);
    const hostCase = caseById.get(job.caseId);
    if (!hostCase) throw new Error(`case ${job.caseId} disappeared mid-run`);
    const result = await runJob(job, index, hostCase, runDir, csdBinary, shims, options.model, options.keep);
    console.log(`  ${result.status}${result.error ? `: ${result.error}` : ""}`);
    results.push(result);
  }
  await writeIndex(runDir, results);
  console.log(`run complete: ${runDir}`);
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}

await main();
