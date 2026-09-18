import { INTENSITIES } from "./types.js";
import type { Intensity, MouthfeelCommand } from "./types.js";

const DEFAULT_INTENSITY: Intensity = 1;
const INTENSITY_RANGE = INTENSITIES.join(" or ");

function parseIntensity(raw: string): Intensity | null {
  const match = INTENSITIES.find((level) => String(level) === raw);
  return match ?? null;
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
  if (!action) return { type: "invalid", message: `Usage: mouthfeel <profile> [${INTENSITIES.join("|")}] or mouthfeel <action>.` };

  if (action === "off" || action === "status" || action === "list" || action === "untranslate") {
    if (parts.length > 1) return { type: "invalid", message: `The ${action} action takes no arguments.` };
    return { type: action };
  }

  if (action === "surprise") {
    if (parts.length > 2) return { type: "invalid", message: "The surprise action takes at most one intensity argument." };
    const intensity = parts[1] === undefined ? DEFAULT_INTENSITY : parseIntensity(parts[1]);
    if (intensity === null) return { type: "invalid", message: `Intensity must be ${INTENSITY_RANGE}.` };
    return { type: "surprise", intensity };
  }

  if (action === "intensity") {
    if (parts[1] === undefined) return { type: "invalid", message: "The intensity action requires a value." };
    if (parts.length > 2) return { type: "invalid", message: "The intensity action takes exactly one value." };
    const intensity = parseIntensity(parts[1]);
    if (intensity === null) return { type: "invalid", message: `Intensity must be ${INTENSITY_RANGE}.` };
    return { type: "intensity", intensity };
  }

  if (!profileIds.includes(action)) {
    const suggestion = nearestProfile(action, profileIds);
    return {
      type: "invalid",
      message: suggestion
        ? `Unknown profile "${action}". Did you mean "${suggestion}"?`
        : `Unknown profile "${action}".`,
    };
  }

  if (parts.length > 2) return { type: "invalid", message: "Activation takes at most one intensity argument." };
  const intensity = parts[1] === undefined ? DEFAULT_INTENSITY : parseIntensity(parts[1]);
  if (intensity === null) return { type: "invalid", message: `Intensity must be ${INTENSITY_RANGE}.` };
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
