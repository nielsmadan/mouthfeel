import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import { compileProfile, validatePhraseEntries, validateProfileSource, validateRoster } from "./profiles.js";
import type { CompiledProfile, PhraseEntry } from "./types.js";

export async function loadProfiles(root: string): Promise<CompiledProfile[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const profiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const directory = join(root, entry.name);
        const source: unknown = parse(await readFile(join(directory, "profile.yaml"), "utf8"));
        validateProfileSource(source);
        const prompt = await readFile(join(directory, "prompt.md"), "utf8");
        let phrases: PhraseEntry[] = [];
        try {
          const parsed: unknown = parse(await readFile(join(directory, "phrases.yaml"), "utf8"));
          validatePhraseEntries(parsed, source.id);
          phrases = parsed;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (source.id !== entry.name) throw new Error(`${entry.name}: directory name must match profile id ${source.id}`);
        return compileProfile(source, prompt, phrases);
      }),
  );
  validateRoster(profiles);
  return profiles;
}
