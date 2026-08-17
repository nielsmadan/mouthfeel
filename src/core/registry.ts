import { readFile } from "node:fs/promises";

import { validateRoster } from "./profiles.js";
import type { CompiledProfile } from "./types.js";

export async function loadRegistry(path: string): Promise<CompiledProfile[]> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  validateRoster(value);
  return value;
}
