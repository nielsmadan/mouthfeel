import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { artifactRoot } from "./config.js";

export interface Entry {
  key: string;
  host: string;
  model: string;
  profile: string;
  intensity: number;
  caseId: string;
  run: number;
  reply: string;
  greeting: string;
  ranAt: string;
}

export function cellKey(entry: Pick<Entry, "host" | "model" | "caseId" | "profile" | "intensity">): string {
  return [entry.host, entry.model, entry.caseId, entry.profile, entry.intensity]
    .join("_")
    .replace(/[^A-Za-z0-9_.:@+~-]/g, "-");
}

// Reasoning effort is a real run variable for codex arms; folding it into the
// model label keeps cross-effort runs from colliding on one cell key.
export function modelLabel(meta: Record<string, unknown>): string {
  const model = String(meta["model"]);
  return typeof meta["effort"] === "string" ? `${model}@${meta["effort"]}` : model;
}

export async function collect(runDirs: string[], baseDir = artifactRoot): Promise<Entry[]> {
  const byKey = new Map<string, Entry>();
  for (const runDir of runDirs) {
    const jobs = (await readdir(join(baseDir, runDir), { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name !== "shims" && e.name !== "workspace")
      .map((e) => e.name);
    for (const job of jobs) {
      const dir = join(baseDir, runDir, job);
      let meta: Record<string, unknown>;
      let reply: string;
      try {
        meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
        reply = await readFile(join(dir, "reply.md"), "utf8");
      } catch {
        continue;
      }
      let greeting = "";
      try {
        greeting = await readFile(join(dir, "greeting.md"), "utf8");
      } catch {
        // pane-scraped hosts may lack a clean greeting; optional
      }
      const entry: Entry = {
        key: "",
        host: String(meta["host"]),
        model: modelLabel(meta),
        profile: String(meta["profile"]),
        intensity: Number(meta["intensity"]),
        caseId: String(meta["caseId"]),
        run: Number(job.match(/-run(\d+)$/)?.[1] ?? 1),
        reply,
        greeting,
        ranAt: typeof meta["ranAt"] === "string" ? meta["ranAt"] : "",
      };
      entry.key = `${cellKey(entry)}_${entry.run}`;
      const existing = byKey.get(entry.key);
      if (!existing || existing.ranAt <= entry.ranAt) byKey.set(entry.key, entry);
    }
  }
  const entries = [...byKey.values()];
  entries.sort(
    (a, b) =>
      a.profile.localeCompare(b.profile) ||
      a.intensity - b.intensity ||
      a.model.localeCompare(b.model) ||
      a.run - b.run,
  );
  return entries;
}
