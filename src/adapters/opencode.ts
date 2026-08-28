import { homedir } from "node:os";
import { join } from "node:path";

import type { Hooks, Plugin } from "@opencode-ai/plugin";

import { parseCommand, unwrapCommandPrompt } from "../core/commands.js";
import { renderActivationGreeting, renderRuntimeCard } from "../core/profiles.js";
import { activeSessionState, applyCommand, markStyled } from "../core/state.js";
import { SidecarStore } from "../core/storage.js";
import type { CompiledProfile } from "../core/types.js";

const HISTORICAL_UNTRANSLATE = [
  "This was a one-shot Mouthfeel control command.",
  "It applied only to the immediately following assistant reply.",
  "It did not disable or alter the active profile for later turns.",
].join(" ");

function stateRoot(): string {
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")
    : process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(base, "mouthfeel", "opencode");
}

export function createOpenCodePlugin(
  profiles: readonly CompiledProfile[],
  options: { stateRoot?: string } = {},
): Plugin {
  return async function mouthfeel(): Promise<Hooks> {
    const store = new SidecarStore(options.stateRoot ?? stateRoot());
    await store.prune().catch(() => undefined);
    const profileIds = profiles.map((profile) => profile.id);
    const pending = new Map<string, string>();
    const modelPrompts = new Map<string, string>();
    const prompts = new Map<string, string>();
    const suppressed = new Set<string>();

    const applyControl = async (sessionID: string, raw: string) => {
      modelPrompts.delete(sessionID);
      const state = await store.read(sessionID);
      const command = parseCommand(raw, profileIds);
      const result = applyCommand(state, command, profiles);
      const profile = result.effect === "profile-greeting"
        ? profiles.find((candidate) => candidate.id === result.state.profileId) ?? null
        : null;
      const storedState = profile && result.effect === "profile-greeting"
        ? markStyled(result.state)
        : result.state;
      try {
        if (storedState) await store.write(sessionID, storedState);
        else await store.delete(sessionID);
      } catch {
        pending.set(sessionID, [
          "This is a Mouthfeel control turn. Use the host's neutral baseline voice.",
          "Respond exactly: Mouthfeel could not update its saved state.",
        ].join("\n"));
        return;
      }
      if (profile && result.effect === "profile-greeting") {
        pending.set(sessionID, renderActivationGreeting(profile, result));
        return;
      }
      pending.set(sessionID, [
        "This is a Mouthfeel control turn. Use the host's neutral baseline voice.",
        result.instruction,
      ].join("\n"));
      if (result.effect === "rewrite-previous") modelPrompts.set(sessionID, result.instruction);
    };

    return {
      async config(config) {
        config.command = {
          ...config.command,
          mouthfeel: {
            description: "Activate or control a temporary output style",
            template: "/mouthfeel $ARGUMENTS",
          },
        };
      },

      async event({ event }) {
        if (event.type !== "session.deleted") return;
        const sessionID = event.properties.info.id;
        pending.delete(sessionID);
        modelPrompts.delete(sessionID);
        prompts.delete(sessionID);
        suppressed.delete(sessionID);
        await store.delete(sessionID).catch(() => undefined);
      },

      async dispose() {
        pending.clear();
        modelPrompts.clear();
        prompts.clear();
        suppressed.clear();
      },

      async "command.execute.before"(input) {
        if (input.command === "mouthfeel") await applyControl(input.sessionID, input.arguments);
      },

      async "chat.message"(input, output) {
        const prompt = output.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        const command = unwrapCommandPrompt(prompt);
        if (command !== null) {
          if (!pending.has(input.sessionID)) await applyControl(input.sessionID, command);
          return;
        }
        pending.delete(input.sessionID);
        modelPrompts.delete(input.sessionID);
        if (/<scheduled-task\b/i.test(prompt)) {
          suppressed.add(input.sessionID);
          const state = await store.read(input.sessionID);
          const active = activeSessionState(state);
          if (active?.lastReplyStyled) await store.write(input.sessionID, {
            ...active,
            lastReplyStyled: false,
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined);
          return;
        }
        prompts.set(input.sessionID, prompt);
      },

      async "experimental.chat.messages.transform"(_input, output) {
        let latestUserIndex = -1;
        for (let index = output.messages.length - 1; index >= 0; index -= 1) {
          const message = output.messages[index];
          if (!message || message.info.role !== "user") continue;
          latestUserIndex = index;
          break;
        }
        for (const [index, message] of output.messages.entries()) {
          if (message.info.role !== "user") continue;
          for (const part of message.parts) {
            if (part.type !== "text") continue;
            const raw = unwrapCommandPrompt(part.text);
            if (raw === null || parseCommand(raw, profileIds).type !== "untranslate") continue;
            if (index !== latestUserIndex) {
              part.text = HISTORICAL_UNTRANSLATE;
              continue;
            }
            const modelPrompt = modelPrompts.get(message.info.sessionID);
            if (modelPrompt) part.text = modelPrompt;
          }
        }
      },

      async "experimental.chat.system.transform"(input, output) {
        const sessionID = input.sessionID;
        if (!sessionID) return;
        if (suppressed.delete(sessionID)) {
          prompts.delete(sessionID);
          return;
        }
        const instruction = pending.get(sessionID);
        if (instruction) {
          prompts.delete(sessionID);
          output.system.push(instruction);
          return;
        }
        const prompt = prompts.get(sessionID) ?? "";
        prompts.delete(sessionID);
        const state = await store.read(sessionID);
        const active = activeSessionState(state);
        if (!active) return;
        const profile = profiles.find((candidate) => candidate.id === active.profileId);
        if (!profile) {
          await store.delete(sessionID).catch(() => undefined);
          return;
        }
        output.system.push(renderRuntimeCard(profile, active.intensity, prompt));
        await store.write(sessionID, markStyled(active)).catch(() => undefined);
      },

      async "experimental.session.compacting"(_input, output) {
        prompts.delete(_input.sessionID);
        const state = await store.read(_input.sessionID);
        const active = activeSessionState(state);
        if (active) await store.write(_input.sessionID, {
          ...active,
          lastReplyStyled: false,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
        output.context.push("Do not preserve Mouthfeel style instructions in the compacted summary. Active state is stored and reinjected separately.");
      },
    };
  };
}
