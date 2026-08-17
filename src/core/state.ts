import type {
  CommandResult,
  CompiledProfile,
  MouthfeelCommand,
  MouthfeelSessionState,
} from "./types.js";

interface ApplyOptions {
  now?: () => Date;
  random?: () => number;
}

function notify(
  state: MouthfeelSessionState | null,
  instruction: string,
  notification: string,
): CommandResult {
  return { state, instruction, notification, effect: "notify" };
}

function newState(profileId: string, intensity: 1 | 2 | 3, now: () => Date): MouthfeelSessionState {
  return {
    version: 1,
    profileId,
    intensity,
    lastReplyStyled: false,
    updatedAt: now().toISOString(),
  };
}

function touch(
  state: MouthfeelSessionState,
  now: () => Date,
  patch: Partial<Pick<MouthfeelSessionState, "intensity" | "lastReplyStyled">>,
): MouthfeelSessionState {
  return { ...state, ...patch, updatedAt: now().toISOString() };
}

export function applyCommand(
  state: MouthfeelSessionState | null,
  command: MouthfeelCommand,
  profiles: readonly CompiledProfile[],
  options: ApplyOptions = {},
): CommandResult {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;

  if (command.type === "invalid") {
    return notify(
      state ? touch(state, now, { lastReplyStyled: false }) : null,
      `Respond exactly: ${command.message}`,
      command.message,
    );
  }
  if (command.type === "off") return notify(null, "Respond exactly: Mouthfeel is off.", "Mouthfeel is off.");

  if (command.type === "list") {
    const practical = profiles.filter((profile) => profile.category === "practical");
    const fun = profiles.filter((profile) => profile.category === "fun");
    const format = (profile: CompiledProfile) => `${profile.id} — ${profile.summary}`;
    const notification = `Practical:\n${practical.map(format).join("\n")}\nFun:\n${fun.map(format).join("\n")}`;
    return notify(
      state ? touch(state, now, { lastReplyStyled: false }) : null,
      `Reply neutrally with this profile list:\n${notification}`,
      notification,
    );
  }

  if (command.type === "status") {
    const notification = state
      ? `Mouthfeel: ${state.profileId}, intensity ${state.intensity}.`
      : "Mouthfeel is off.";
    return notify(
      state ? touch(state, now, { lastReplyStyled: false }) : null,
      `Respond exactly: ${notification}`,
      notification,
    );
  }

  if (command.type === "activate") {
    const notification = `Mouthfeel: ${command.profileId}, intensity ${command.intensity}. This applies to future replies.`;
    return notify(
      newState(command.profileId, command.intensity, now),
      `Respond exactly: ${notification}`,
      notification,
    );
  }

  if (command.type === "surprise") {
    const eligible = profiles.filter((profile) => profile.surpriseEligible);
    if (eligible.length === 0) {
      return notify(state, "Respond exactly: No surprise profiles are available.", "No surprise profiles are available.");
    }
    const index = Math.min(eligible.length - 1, Math.floor(random() * eligible.length));
    const profile = eligible[index];
    if (!profile) {
      return notify(state, "Respond exactly: No surprise profiles are available.", "No surprise profiles are available.");
    }
    const notification = `Surprise selected ${profile.id}, intensity ${command.intensity}. This applies to future replies.`;
    return notify(
      newState(profile.id, command.intensity, now),
      `Respond exactly: ${notification}`,
      notification,
    );
  }

  if (command.type === "intensity") {
    if (!state) {
      return notify(state, "Respond exactly: Activate a profile before changing intensity.", "Activate a profile before changing intensity.");
    }
    const notification = `Mouthfeel intensity ${command.intensity}. This applies to future replies.`;
    return notify(
      touch(state, now, { intensity: command.intensity, lastReplyStyled: false }),
      `Respond exactly: ${notification}`,
      notification,
    );
  }

  if (!state?.lastReplyStyled) {
    return notify(state, "Respond exactly: There is nothing to untranslate.", "There is nothing to untranslate.");
  }
  return {
    state: touch(state, now, { lastReplyStyled: false }),
    instruction:
      "Do not apply Mouthfeel to this control turn. Rewrite the immediately preceding assistant reply in the host baseline voice. Preserve every fact, conclusion, caveat, code block, command, exact quote, and requested format. Output only the rewritten reply. Keep the active Mouthfeel profile for future replies.",
    notification: "Rewriting the previous reply without Mouthfeel.",
    effect: "rewrite-previous",
  };
}

export function markStyled(state: MouthfeelSessionState, now: () => Date = () => new Date()): MouthfeelSessionState {
  return touch(state, now, { lastReplyStyled: true });
}
