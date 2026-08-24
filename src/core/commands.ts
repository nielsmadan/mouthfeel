import type { Intensity, MouthfeelCommand } from "./types.js";

const ACTIONS = new Set(["surprise", "intensity", "off", "status", "list", "untranslate"]);

function parseIntensity(raw: string | undefined): Intensity | null {
  if (raw === undefined || raw === "") return 2;
  if (raw === "1" || raw === "2" || raw === "3") return Number(raw) as Intensity;
  return null;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[b.length] ?? a.length;
}

function nearestProfile(value: string, profileIds: readonly string[]): string | null {
  return profileIds
    .map((id) => ({ id, score: distance(value, id) }))
    .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))[0]?.id ?? null;
}

export function parseCommand(raw: string, profileIds: readonly string[]): MouthfeelCommand {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const action = parts[0];
  if (!action) return { type: "invalid", message: "Usage: mouthfeel <profile> [1|2|3] or mouthfeel <action>." };

  if (action === "off" || action === "status" || action === "list" || action === "untranslate") {
    if (parts.length > 1) return { type: "invalid", message: `The ${action} action takes no arguments.` };
    return { type: action };
  }

  if (action === "surprise") {
    const intensity = parseIntensity(parts[1]);
    if (intensity === null || parts.length > 2) return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
    return { type: "surprise", intensity };
  }

  if (action === "intensity") {
    const intensity = parseIntensity(parts[1]);
    if (parts[1] === undefined || intensity === null || parts.length > 2) {
      return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
    }
    return { type: "intensity", intensity };
  }

  if (ACTIONS.has(action)) return { type: "invalid", message: `Invalid ${action} command.` };

  if (!profileIds.includes(action)) {
    const suggestion = nearestProfile(action, profileIds);
    return {
      type: "invalid",
      message: suggestion
        ? `Unknown profile "${action}". Did you mean "${suggestion}"?`
        : `Unknown profile "${action}".`,
    };
  }

  const intensity = parseIntensity(parts[1]);
  if (intensity === null || parts.length > 2) return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
  return { type: "activate", profileId: action, intensity };
}

export function unwrapCommandPrompt(prompt: string): string | null {
  const commandArgs = prompt.match(/<command-args>([\s\S]*?)<\/command-args>/i)?.[1];
  const commandName = prompt.match(/<command-name>\s*\/?([^<]+)<\/command-name>/i)?.[1]?.trim().toLowerCase();
  if (commandName === "mouthfeel:use" || commandName === "mouthfeel") {
    return commandArgs?.trim() ?? "";
  }

  const marker = prompt.trim().match(/^MOUTHFEEL_COMMAND:[ \t]*([^\r\n]*)$/i)?.[1];
  if (marker !== undefined) return marker.trim();

  const direct = prompt.trim().match(/^(?:\/mouthfeel(?::use)?|\$mouthfeel:use)(?:\s+([\s\S]*))?$/i);
  if (direct) return direct[1]?.trim() ?? "";
  return null;
}
