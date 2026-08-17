import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import type { CompiledProfile, Intensity } from "./core/types.js";

export interface EvalCase {
  id: string;
  type: string;
  anchor: boolean;
  source: string;
  mustPreserve: string[];
}

export interface EvalJob {
  id: string;
  profileId: string;
  intensity: Intensity;
  caseId: string;
  system: string;
  input: string;
  mustPreserve: string[];
}

interface CaseFrontmatter {
  id: string;
  type: string;
  anchor?: boolean;
  mustPreserve?: string[];
}

function parseFrontmatter(value: unknown, file: string): CaseFrontmatter {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file}: frontmatter must be an object`);
  const metadata = value as Record<string, unknown>;
  if (typeof metadata.id !== "string" || !metadata.id.trim()) throw new Error(`${file}: id is required`);
  if (typeof metadata.type !== "string" || !metadata.type.trim()) throw new Error(`${file}: type is required`);
  if (metadata.anchor !== undefined && typeof metadata.anchor !== "boolean") throw new Error(`${file}: anchor must be boolean`);
  if (metadata.mustPreserve !== undefined
    && (!Array.isArray(metadata.mustPreserve) || metadata.mustPreserve.some((item) => typeof item !== "string"))) {
    throw new Error(`${file}: mustPreserve must contain only strings`);
  }
  return {
    id: metadata.id,
    type: metadata.type,
    ...(metadata.anchor !== undefined ? { anchor: metadata.anchor } : {}),
    ...(metadata.mustPreserve !== undefined ? { mustPreserve: metadata.mustPreserve as string[] } : {}),
  };
}

export async function loadEvalCases(root: string): Promise<EvalCase[]> {
  const files = (await readdir(root)).filter((file) => file.endsWith(".md")).sort();
  return Promise.all(files.map(async (file) => {
    const raw = await readFile(join(root, file), "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: expected YAML frontmatter`);
    const metadata = parseFrontmatter(parse(match[1] ?? "") as unknown, file);
    return {
      id: metadata.id,
      type: metadata.type,
      anchor: metadata.anchor ?? false,
      source: (match[2] ?? "").trim(),
      mustPreserve: metadata.mustPreserve ?? [],
    };
  }));
}

export function buildEvalJobs(
  profiles: readonly CompiledProfile[],
  cases: readonly EvalCase[],
  anchorsOnly = true,
): EvalJob[] {
  const selectedCases = anchorsOnly ? cases.filter((candidate) => candidate.anchor) : cases;
  return profiles.flatMap((profile) => ([1, 2, 3] as const).flatMap((intensity) => selectedCases.map((evalCase) => ({
    id: `${profile.id}.${intensity}.${evalCase.id}`,
    profileId: profile.id,
    intensity,
    caseId: evalCase.id,
    system: profile.cards[intensity],
    input: [
      "Rewrite the following assistant reply as the direct reply to its original user. Apply the active Mouthfeel while preserving every substantive detail and literal artifact. Output only the rewritten reply.",
      "",
      evalCase.source,
    ].join("\n"),
    mustPreserve: evalCase.mustPreserve,
  }))));
}
