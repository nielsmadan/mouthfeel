import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCommand, unwrapCommandPrompt } from "../core/commands.js";
import { renderActivationGreeting, renderRuntimeCard, renderRuntimeReminder } from "../core/profiles.js";
import { loadRegistry } from "../core/registry.js";
import { activeSessionState, applyCommand, markStyled } from "../core/state.js";
import { SidecarStore } from "../core/storage.js";
import type { CompiledProfile } from "../core/types.js";

export interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  prompt?: string;
  source?: string;
}

interface HookOptionBase {
  store: SidecarStore;
  random?: () => number;
  now?: () => Date;
  remindOnEveryActiveTurn?: boolean;
}

type HookOptions = HookOptionBase & (
  | { profiles: readonly CompiledProfile[]; loadProfiles?: never }
  | { profiles?: never; loadProfiles: () => Promise<readonly CompiledProfile[]> }
);

export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart" | "UserPromptSubmit";
    additionalContext: string;
  };
}

const PROFILE_REVOCATION = "Mouthfeel is off for future replies. Ignore every earlier Mouthfeel profile card and reminder in this conversation. Use the host baseline voice unless the user explicitly requests another style.";

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

async function profilesFor(options: HookOptions): Promise<readonly CompiledProfile[]> {
  return options.profiles ?? options.loadProfiles();
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
    const active = activeSessionState(state);
    if (!active) return output("SessionStart", PROFILE_REVOCATION);
    const profiles = await profilesFor(options);
    const profile = profileFor(profiles, active.profileId);
    if (!profile) {
      await options.store.delete(sessionId);
      return null;
    }
    const restored = input.source === "compact"
      ? { ...active, lastReplyStyled: false, updatedAt: (options.now?.() ?? new Date()).toISOString() }
      : active;
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
    const active = activeSessionState(state);
    if (active?.lastReplyStyled) {
      await options.store.write(sessionId, {
        ...active,
        lastReplyStyled: false,
        updatedAt: (options.now?.() ?? new Date()).toISOString(),
      });
    }
    return null;
  }
  const commandText = unwrapCommandPrompt(input.prompt);
  if (commandText !== null) {
    const profiles = await profilesFor(options);
    const command = parseCommand(commandText, profiles.map((profile) => profile.id));
    const result = applyCommand(state, command, profiles, {
      ...(options.random ? { random: options.random } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const activeResult = activeSessionState(result.state);
    const selectedProfile = (result.effect === "profile-selected" || result.effect === "profile-greeting") && activeResult
      ? profileFor(profiles, activeResult.profileId)
      : null;
    const greetingProfile = result.effect === "profile-greeting" ? selectedProfile : null;
    const storedState = greetingProfile && result.effect === "profile-greeting"
      ? markStyled(result.state, options.now)
      : result.state;
    if (storedState) await options.store.write(sessionId, storedState);
    else await options.store.delete(sessionId);
    const context = greetingProfile && result.effect === "profile-greeting"
      ? renderActivationGreeting(greetingProfile, result)
      : [
          ...(selectedProfile && activeResult
            ? [
                "The profile card below applies only to future replies. Do not apply it to this control response.",
                renderRuntimeCard(selectedProfile, activeResult.intensity, ""),
              ]
            : []),
          ...(result.effect === "profile-disabled" ? [PROFILE_REVOCATION] : []),
          "This is a Mouthfeel control turn. Do not apply any Mouthfeel profile to the response.",
          result.instruction,
        ].join("\n\n");
    return output("UserPromptSubmit", context);
  }

  const active = activeSessionState(state);
  if (!active) return null;
  const profiles = await profilesFor(options);
  const profile = profileFor(profiles, active.profileId);
  if (!profile) {
    await options.store.delete(sessionId);
    return null;
  }
  const context = renderRuntimeReminder(profile, active.intensity, input.prompt, {
    always: options.remindOnEveryActiveTurn === true,
  });
  try {
    await options.store.write(sessionId, markStyled(active, options.now));
  } catch (error) {
    if (!context) throw error;
  }
  return context ? output("UserPromptSubmit", context) : null;
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
    const result = await handleHook(input, {
      loadProfiles: () => loadRegistry(join(packageRoot(), "registry.json")),
      store: new SidecarStore(stateRoot()),
      remindOnEveryActiveTurn: process.argv.includes("--remind-every-active-turn"),
    });
    if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`mouthfeel: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
