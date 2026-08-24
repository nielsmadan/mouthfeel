import type { CustomEntry, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { parseCommand } from "../core/commands.js";
import { renderRuntimeCard } from "../core/profiles.js";
import { activeSessionState, applyCommand, markStyled } from "../core/state.js";
import { isSessionState } from "../core/storage.js";
import type { CompiledProfile, MouthfeelSessionState } from "../core/types.js";

const ENTRY_TYPE = "mouthfeel-state";

function restoredState(context: ExtensionContext, profiles: readonly CompiledProfile[]): MouthfeelSessionState | null {
  const entry = context.sessionManager.getEntries()
    .filter((candidate): candidate is CustomEntry => candidate.type === "custom" && candidate.customType === ENTRY_TYPE)
    .at(-1);
  const data = entry?.data;
  const restored = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>).state
    : undefined;
  if (!restored || !isSessionState(restored)) return null;
  const active = activeSessionState(restored);
  return !active || profiles.some((profile) => profile.id === active.profileId) ? restored : null;
}

export function createPiExtension(profiles: readonly CompiledProfile[]) {
  return function mouthfeel(pi: ExtensionAPI): void {
    let state: MouthfeelSessionState | null = null;
    let oneShotInstruction: string | null = null;

    const persist = () => pi.appendEntry(ENTRY_TYPE, { state });

    pi.on("session_start", async (_event, context) => {
      state = restoredState(context, profiles);
      oneShotInstruction = null;
    });

    pi.on("session_tree", async (_event, context) => {
      state = restoredState(context, profiles);
      oneShotInstruction = null;
    });

    pi.on("session_compact", async () => {
      const active = activeSessionState(state);
      if (!active) return;
      state = { ...active, lastReplyStyled: false, updatedAt: new Date().toISOString() };
      persist();
    });

    pi.registerCommand("mouthfeel", {
      description: "Activate or control a temporary output style",
      handler: async (args, context) => {
        const command = parseCommand(args, profiles.map((profile) => profile.id));
        const result = applyCommand(state, command, profiles);
        state = result.state;

        if (result.effect === "rewrite-previous") {
          oneShotInstruction = result.instruction;
          persist();
          pi.sendUserMessage("Rewrite the previous reply without Mouthfeel.");
          return;
        }

        persist();
        context.ui.notify(result.notification, command.type === "invalid" ? "warning" : "info");
      },
    });

    pi.on("before_agent_start", async (event) => {
      if (oneShotInstruction) {
        const instruction = oneShotInstruction;
        oneShotInstruction = null;
        return { systemPrompt: `${event.systemPrompt}\n\n${instruction}` };
      }
      const active = activeSessionState(state);
      if (!active) return undefined;
      if (/<scheduled-task\b/i.test(event.prompt)) {
        state = { ...active, lastReplyStyled: false, updatedAt: new Date().toISOString() };
        persist();
        return undefined;
      }
      const profile = profiles.find((candidate) => candidate.id === active.profileId);
      if (!profile) {
        state = null;
        persist();
        return undefined;
      }
      state = markStyled(active);
      persist();
      return {
        systemPrompt: `${event.systemPrompt}\n\n${renderRuntimeCard(profile, state.intensity, event.prompt)}`,
      };
    });
  };
}
