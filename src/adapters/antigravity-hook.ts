import { open, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCommand, unwrapCommandPrompt } from "../core/commands.js";
import { renderRuntimeCard } from "../core/profiles.js";
import { loadRegistry } from "../core/registry.js";
import { applyCommand, markStyled } from "../core/state.js";
import { SidecarStore } from "../core/storage.js";

interface AntigravityInput {
  conversationId?: string;
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  invocationNum?: number;
}

function collectStrings(value: unknown, result: string[]): void {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, result);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, result);
  }
}

function looksUserAuthored(value: Record<string, unknown>): boolean {
  const labels: string[] = [];
  for (const key of ["role", "author", "type", "kind"]) collectStrings(value[key], labels);
  return labels.some((label) => /(^|[_ -])user($|[_ -])|human/i.test(label));
}

export function latestUserText(raw: string): string {
  const lines = raw.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index] ?? "") as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (!looksUserAuthored(value as Record<string, unknown>)) continue;
      const strings: string[] = [];
      collectStrings(value, strings);
      return strings.join("\n");
    } catch {
      continue;
    }
  }
  return "";
}

async function readTranscriptTail(path: string): Promise<string> {
  const details = await stat(path);
  const length = Math.min(details.size, 131_072);
  const buffer = Buffer.alloc(length);
  const handle = await open(path, "r");
  try {
    await handle.read(buffer, 0, length, details.size - length);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  try {
    const rawInput = await new Promise<string>((resolveInput) => {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      process.stdin.on("end", () => resolveInput(Buffer.concat(chunks).toString("utf8")));
    });
    const input = JSON.parse(rawInput) as AntigravityInput;
    if (!input.conversationId || !input.transcriptPath) {
      process.stdout.write("{}\n");
      return;
    }
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const profiles = await loadRegistry(join(packageRoot, "registry.json"));
    const store = new SidecarStore(input.artifactDirectoryPath
      ? join(input.artifactDirectoryPath, ".mouthfeel")
      : join(packageRoot, ".state"));
    await store.prune().catch(() => undefined);
    const state = await store.read(input.conversationId);
    const prompt = latestUserText(await readTranscriptTail(input.transcriptPath));
    const rawCommand = input.invocationNum === 0 ? unwrapCommandPrompt(prompt) : null;

    if (rawCommand !== null) {
      const result = applyCommand(
        state,
        parseCommand(rawCommand, profiles.map((profile) => profile.id)),
        profiles,
      );
      if (result.state) await store.write(input.conversationId, result.state);
      else await store.delete(input.conversationId);
      process.stdout.write(`${JSON.stringify({
        injectSteps: [{ ephemeralMessage: `This is a neutral Mouthfeel control turn.\n${result.instruction}` }],
      })}\n`);
      return;
    }

    if (/<scheduled-task\b/i.test(prompt)) {
      if (state?.lastReplyStyled) await store.write(input.conversationId, {
        ...state,
        lastReplyStyled: false,
        updatedAt: new Date().toISOString(),
      });
      process.stdout.write("{}\n");
      return;
    }

    if (!state) {
      process.stdout.write("{}\n");
      return;
    }
    const profile = profiles.find((candidate) => candidate.id === state.profileId);
    if (!profile) {
      await store.delete(input.conversationId);
      process.stdout.write("{}\n");
      return;
    }
    await store.write(input.conversationId, markStyled(state));
    process.stdout.write(`${JSON.stringify({
      injectSteps: [{ ephemeralMessage: renderRuntimeCard(profile, state.intensity, prompt) }],
    })}\n`);
  } catch (error) {
    process.stderr.write(`mouthfeel: ${error instanceof Error ? error.message : String(error)}\n`);
    process.stdout.write("{}\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
