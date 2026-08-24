import { homedir } from "node:os";
import { join } from "node:path";

import type { Hooks, Plugin } from "@opencode-ai/plugin";

import { parseCommand, unwrapCommandPrompt } from "../core/commands.js";
import { renderRuntimeCard } from "../core/profiles.js";
import { activeSessionState, applyCommand, markStyled } from "../core/state.js";
import { SidecarStore } from "../core/storage.js";
import type { CompiledProfile } from "../core/types.js";

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
    const pending = new Map<string, string>();
    const prompts = new Map<string, string>();
    const suppressed = new Set<string>();

    const applyControl = async (sessionID: string, raw: string) => {
      const state = await store.read(sessionID);
      const command = parseCommand(raw, profiles.map((profile) => profile.id));
      const result = applyCommand(state, command, profiles);
      try {
        if (result.state) await store.write(sessionID, result.state);
        else await store.delete(sessionID);
      } catch {
        pending.set(sessionID, [
          "This is a Mouthfeel control turn. Use the host's neutral baseline voice.",
          "Respond exactly: Mouthfeel could not update its saved state.",
        ].join("\n"));
        return;
      }
      pending.set(sessionID, [
        "This is a Mouthfeel control turn. Use the host's neutral baseline voice.",
        result.instruction,
      ].join("\n"));
    };

    return {
      async config(config) {
        config.command = {
          ...config.command,
          mouthfeel: {
            description: "Activate or control a temporary output style",
            template: "MOUTHFEEL_COMMAND: $ARGUMENTS",
          },
        };
      },

      async event({ event }) {
        if (event.type !== "session.deleted") return;
        const sessionID = event.properties.info.id;
        pending.delete(sessionID);
        prompts.delete(sessionID);
        suppressed.delete(sessionID);
        await store.delete(sessionID).catch(() => undefined);
      },

      async dispose() {
        pending.clear();
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

      async "experimental.chat.system.transform"(input, output) {
        const sessionID = input.sessionID;
        if (!sessionID) return;
        if (suppressed.delete(sessionID)) {
          prompts.delete(sessionID);
          return;
        }
        const instruction = pending.get(sessionID);
        if (instruction) {
          pending.delete(sessionID);
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
