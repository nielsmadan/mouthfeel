import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCommand, unwrapCommandPrompt } from "../core/commands.js";
import { renderRuntimeCard, renderRuntimeReminder } from "../core/profiles.js";
import { loadRegistry } from "../core/registry.js";
import { applyCommand, markStyled } from "../core/state.js";
import { SidecarStore } from "../core/storage.js";
import type { CompiledProfile } from "../core/types.js";

export interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  prompt?: string;
  source?: string;
}

interface HookOptions {
  profiles: readonly CompiledProfile[];
  store: SidecarStore;
  random?: () => number;
  now?: () => Date;
}

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart" | "UserPromptSubmit";
    additionalContext: string;
  };
}

function output(event: "SessionStart" | "UserPromptSubmit", additionalContext: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext,
    },
  };
}

function profileFor(profiles: readonly CompiledProfile[], id: string): CompiledProfile | null {
  return profiles.find((profile) => profile.id === id) ?? null;
}

export async function handleHook(input: HookInput, options: HookOptions): Promise<HookOutput | null> {
  const sessionId = input.session_id;
  if (!sessionId) return null;
  const event = input.hook_event_name;

  if (event === "SessionStart") {
    await options.store.prune().catch(() => undefined);
    if (input.source === "startup" || input.source === "clear") {
      await options.store.delete(sessionId);
      return null;
    }
    if (input.source !== "resume" && input.source !== "compact") return null;
    const state = await options.store.read(sessionId);
    if (!state) return null;
    const profile = profileFor(options.profiles, state.profileId);
    if (!profile) {
      await options.store.delete(sessionId);
      return null;
    }
    const restored = input.source === "compact"
      ? { ...state, lastReplyStyled: false, updatedAt: (options.now?.() ?? new Date()).toISOString() }
      : state;
    if (input.source === "compact") {
      await options.store.write(sessionId, restored);
    }
    const context = [
      "Mouthfeel remains active after this session transition.",
      renderRuntimeCard(profile, restored.intensity, ""),
    ].join("\n\n");
    return output("SessionStart", context);
  }

  if (event !== "UserPromptSubmit" || typeof input.prompt !== "string") return null;
  const state = await options.store.read(sessionId);
  if (/<scheduled-task\b/i.test(input.prompt)) {
    if (state?.lastReplyStyled) {
      await options.store.write(sessionId, {
        ...state,
        lastReplyStyled: false,
        updatedAt: (options.now?.() ?? new Date()).toISOString(),
      });
    }
    return null;
  }
  const commandText = unwrapCommandPrompt(input.prompt);
  if (commandText !== null) {
    const command = parseCommand(commandText, options.profiles.map((profile) => profile.id));
    const result = applyCommand(state, command, options.profiles, {
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    if (result.state) await options.store.write(sessionId, result.state);
    else await options.store.delete(sessionId);
    return output("UserPromptSubmit", [
      "This is a Mouthfeel control turn. Do not apply any Mouthfeel profile to the response.",
      result.instruction,
    ].join("\n"));
  }

  if (!state) return null;
  const profile = profileFor(options.profiles, state.profileId);
  if (!profile) {
    await options.store.delete(sessionId);
    return null;
  }
  const context = state.lastReplyStyled
    ? renderRuntimeReminder(profile, state.intensity, input.prompt)
    : renderRuntimeCard(profile, state.intensity, input.prompt);
  await options.store.write(sessionId, markStyled(state, options.now));
  return output("UserPromptSubmit", context);
}

function packageRoot(): string {
  const configured = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (configured) return configured;
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function stateRoot(): string {
  const configured = process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA;
  if (configured) return configured;
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
    : process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(base, "mouthfeel");
}

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  try {
    const raw = await readStandardInput();
    if (!raw.trim()) return;
    const input = JSON.parse(raw) as HookInput;
    const profiles = await loadRegistry(join(packageRoot(), "registry.json"));
    const result = await handleHook(input, { profiles, store: new SidecarStore(stateRoot()) });
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`mouthfeel: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
