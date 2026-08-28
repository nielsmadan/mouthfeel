import type {
  ActiveMouthfeelSessionState,
  CommandResult,
  CompiledProfile,
  MouthfeelCommand,
  MouthfeelSessionState,
  ProfileGreetingCommandResult,
} from "./types.js";

interface ApplyOptions {
  now?: () => Date;
  random?: () => number;
}

function notify(
  state: MouthfeelSessionState | null,
  instruction: string,
  notification: string,
  effect: Exclude<CommandResult["effect"], "profile-greeting"> = "notify",
): CommandResult {
  return { state, instruction, notification, effect };
}

function greet(
  state: ActiveMouthfeelSessionState,
  notification: string,
): ProfileGreetingCommandResult {
  return {
    state,
    instruction: `Respond exactly: ${notification}`,
    notification,
    effect: "profile-greeting",
  };
}

function newState(profileId: string, intensity: 1 | 2 | 3, now: () => Date): ActiveMouthfeelSessionState {
  return {
    version: 1,
    mode: "active",
    profileId,
    intensity,
    lastReplyStyled: false,
    updatedAt: now().toISOString(),
  };
}

function touch(
  state: ActiveMouthfeelSessionState,
  now: () => Date,
  patch: Partial<Pick<ActiveMouthfeelSessionState, "intensity" | "lastReplyStyled">>,
): ActiveMouthfeelSessionState {
  return { ...state, ...patch, updatedAt: now().toISOString() };
}

export function activeSessionState(state: MouthfeelSessionState | null): ActiveMouthfeelSessionState | null {
  return state?.mode === "off" ? null : state;
}

function neutralState(state: MouthfeelSessionState | null, now: () => Date): MouthfeelSessionState | null {
  const active = activeSessionState(state);
  if (active) return touch(active, now, { lastReplyStyled: false });
  return state ? { ...state, updatedAt: now().toISOString() } : null;
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
      neutralState(state, now),
      `Respond exactly: ${command.message}`,
      command.message,
    );
  }
  if (command.type === "off") {
    return notify({
      version: 1,
      mode: "off",
      lastReplyStyled: false,
      updatedAt: now().toISOString(),
    }, "Respond exactly: Mouthfeel is off.", "Mouthfeel is off.", "profile-disabled");
  }

  if (command.type === "list") {
    const practical = profiles.filter((profile) => profile.category === "practical");
    const fun = profiles.filter((profile) => profile.category === "fun");
    const format = (profile: CompiledProfile) => `${profile.id} — ${profile.summary}`;
    const notification = `Practical:\n${practical.map(format).join("\n")}\nFun:\n${fun.map(format).join("\n")}`;
    return notify(
      neutralState(state, now),
      `Reply neutrally with this profile list:\n${notification}`,
      notification,
    );
  }

  if (command.type === "status") {
    const active = activeSessionState(state);
    const notification = active
      ? `Mouthfeel: ${active.profileId}, intensity ${active.intensity}.`
      : "Mouthfeel is off.";
    return notify(
      neutralState(state, now),
      `Respond exactly: ${notification}`,
      notification,
    );
  }

  if (command.type === "activate") {
    const notification = `Mouthfeel: ${command.profileId}, intensity ${command.intensity}. This applies to future replies.`;
    return greet(
      newState(command.profileId, command.intensity, now),
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
    return greet(
      newState(profile.id, command.intensity, now),
      notification,
    );
  }

  if (command.type === "intensity") {
    const active = activeSessionState(state);
    if (!active) {
      return notify(state, "Respond exactly: Activate a profile before changing intensity.", "Activate a profile before changing intensity.");
    }
    const notification = `Mouthfeel intensity ${command.intensity}. This applies to future replies.`;
    return notify(
      touch(active, now, { intensity: command.intensity, lastReplyStyled: false }),
      `Respond exactly: ${notification}`,
      notification,
      "profile-selected",
    );
  }

  const active = activeSessionState(state);
  if (!active?.lastReplyStyled) {
    return notify(state, "Respond exactly: There is nothing to untranslate.", "There is nothing to untranslate.");
  }
  return {
    state: touch(active, now, { lastReplyStyled: false }),
    instruction:
      "Do not apply Mouthfeel to this control turn. Rewrite the immediately preceding assistant reply in the host baseline voice. Preserve every fact, conclusion, caveat, code block, command, exact quote, and requested format. Output only the rewritten reply. Keep the active Mouthfeel profile for future replies.",
    notification: "Rewriting the previous reply without Mouthfeel.",
    effect: "rewrite-previous",
  };
}

export function markStyled(state: ActiveMouthfeelSessionState, now: () => Date = () => new Date()): ActiveMouthfeelSessionState {
  return touch(state, now, { lastReplyStyled: true });
}
