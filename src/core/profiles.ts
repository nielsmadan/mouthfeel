import type { CompiledProfile, Intensity, PhraseEntry, ProfileSource } from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BOUNDARIES = [
  "Style only the natural-language prose in the direct reply to the user.",
  "Do not style code, commands, paths, identifiers, exact quotes, errors, tool output, generated files, comments, commit messages, issues, pull requests, subagent output, or unattended tasks unless the user explicitly asks for that artifact in this voice.",
  "Preserve facts, conclusions, uncertainty, safety boundaries, authorization requirements, requested format, and the user's language.",
  "Never mention, label, or explain the profile unless the user asks about it.",
];

function lines(title: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  return `\n## ${title}\n${values.map((value) => `- ${value}`).join("\n")}\n`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must contain only strings`);
  }
  return value;
}

function optionalString(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`${label} must be a string`);
}

export function validatePhraseEntries(value: unknown, profileId: string): asserts value is PhraseEntry[] {
  if (!Array.isArray(value)) throw new Error(`${profileId}: phrases must be an array`);
  for (const [index, item] of value.entries()) {
    const phrase = record(item, `${profileId}: phrase ${index + 1}`);
    string(phrase.text, `${profileId}: phrase ${index + 1} text`);
    strings(phrase.useWhen, `${profileId}: phrase ${index + 1} useWhen`);
    if (phrase.avoidWhen !== undefined) strings(phrase.avoidWhen, `${profileId}: phrase ${index + 1} avoidWhen`);
    if (phrase.minIntensity !== 1 && phrase.minIntensity !== 2 && phrase.minIntensity !== 3) {
      throw new Error(`${profileId}: phrase ${index + 1} minIntensity must be 1, 2, or 3`);
    }
    optionalString(phrase.meaning, `${profileId}: phrase ${index + 1} meaning`);
    optionalString(phrase.source, `${profileId}: phrase ${index + 1} source`);
    optionalString(phrase.speaker, `${profileId}: phrase ${index + 1} speaker`);
  }
}

export function validateProfileSource(value: unknown): asserts value is ProfileSource {
  const source = record(value, "profile");
  const id = string(source.id, "profile id");
  if (source.version !== 1) throw new Error(`${id}: version must be 1`);
  if (!ID_PATTERN.test(id)) throw new Error(`${id}: id must be kebab-case`);
  string(source.displayName, `${id}: displayName`);
  string(source.summary, `${id}: summary`);
  if (source.category !== "practical" && source.category !== "fun") throw new Error(`${id}: invalid category`);
  if (typeof source.surpriseEligible !== "boolean") throw new Error(`${id}: surpriseEligible must be boolean`);
  if (source.surpriseEligible && source.category !== "fun") throw new Error(`${id}: practical profiles cannot be surprise eligible`);
  strings(source.baseContract, `${id}: baseContract`);
  strings(source.markers, `${id}: markers`);
  strings(source.controlledImperfections, `${id}: controlledImperfections`);
  strings(source.avoid, `${id}: avoid`);
  const intensity = record(source.intensity, `${id}: intensity`);
  for (const level of [1, 2, 3] as const) {
    const instructions = strings(intensity[level], `${id}: intensity ${level}`);
    if (instructions.length === 0) {
      throw new Error(`${id}: intensity ${level} must contain instructions`);
    }
  }
}

export function compileProfile(
  source: ProfileSource,
  prompt: string,
  phrases: readonly PhraseEntry[],
): CompiledProfile {
  validateProfileSource(source);
  if (!prompt.trim()) throw new Error(`${source.id}: prompt.md is empty`);
  const cards = {} as Record<Intensity, string>;
  for (const level of [1, 2, 3] as const) {
    const overlays = ([1, 2, 3] as const)
      .filter((candidate) => candidate <= level)
      .flatMap((candidate) => source.intensity[candidate]);
    cards[level] = [
      `# Mouthfeel: ${source.displayName} (intensity ${level})`,
      prompt.trim(),
      lines("Contract", source.baseContract),
      lines("Recognizable markers", source.markers),
      lines("Controlled imperfections", source.controlledImperfections),
      lines("Intensity", overlays),
      lines("Avoid", source.avoid),
      lines("Hard boundaries", BOUNDARIES),
    ].join("\n").trim();
  }
  return {
    id: source.id,
    displayName: source.displayName,
    category: source.category,
    summary: source.summary,
    surpriseEligible: source.surpriseEligible,
    cards,
    ...(phrases.length > 0 ? { phrases: [...phrases] } : {}),
  };
}

export function validateRoster(value: unknown): asserts value is CompiledProfile[] {
  if (!Array.isArray(value)) throw new Error("registry must contain an array");
  const profiles = value as unknown[];
  const ids = new Set<string>();
  for (const item of profiles) {
    const profile = record(item, "compiled profile");
    const id = string(profile.id, "compiled profile id");
    if (!ID_PATTERN.test(id)) throw new Error(`invalid profile id: ${id}`);
    if (ids.has(id)) throw new Error(`duplicate profile id: ${id}`);
    string(profile.displayName, `${id}: displayName`);
    string(profile.summary, `${id}: summary`);
    if (profile.category !== "practical" && profile.category !== "fun") throw new Error(`${id}: invalid category`);
    if (typeof profile.surpriseEligible !== "boolean") throw new Error(`${id}: surpriseEligible must be boolean`);
    const cards = record(profile.cards, `${id}: cards`);
    for (const level of [1, 2, 3] as const) {
      if (typeof cards[level] !== "string" || !cards[level].trim()) {
        throw new Error(`${id}: missing intensity ${level} card`);
      }
    }
    if (profile.phrases !== undefined) validatePhraseEntries(profile.phrases, id);
    ids.add(id);
  }
  if (!profiles.some((profile) => record(profile, "compiled profile").category === "practical")) {
    throw new Error("roster must include practical profiles");
  }
  if (!profiles.some((profile) => record(profile, "compiled profile").category === "fun")) {
    throw new Error("roster must include fun profiles");
  }
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

export function selectPhrases(
  profile: CompiledProfile,
  intensity: Intensity,
  prompt: string,
  limit = 3,
): PhraseEntry[] {
  const promptTerms = terms(prompt);
  return (profile.phrases ?? [])
    .filter((entry) => entry.minIntensity <= intensity)
    .map((entry) => ({
      entry,
      score: entry.useWhen.reduce((total, value) => {
        for (const term of terms(value)) if (promptTerms.has(term)) total += 1;
        return total;
      }, 0),
    }))
    .filter(({ score }) => score >= 2)
    .sort((left, right) => right.score - left.score || left.entry.text.localeCompare(right.entry.text))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function renderRuntimeCard(profile: CompiledProfile, intensity: Intensity, prompt: string): string {
  const selected = selectPhrases(profile, intensity, prompt);
  if (selected.length === 0) return profile.cards[intensity];
  const phraseLines = selected.map((entry) => {
    const guard = entry.avoidWhen?.length ? ` Avoid when: ${entry.avoidWhen.join(", ")}.` : "";
    return `- Candidate: “${entry.text}” Use only on a strong semantic match to: ${entry.useWhen.join(", ")}.${guard}`;
  });
  return `${profile.cards[intensity]}\n\n## Optional phrase candidates\n${phraseLines.join("\n")}\nUse at most one candidate. Never force a quotation.`;
}

export function renderRuntimeReminder(profile: CompiledProfile, intensity: Intensity, prompt: string): string {
  const selected = selectPhrases(profile, intensity, prompt);
  const reminder = `Mouthfeel remains active: ${profile.displayName}, intensity ${intensity}. Apply the complete profile contract already provided earlier in this conversation. Keep its hard boundaries.`;
  if (selected.length === 0) return reminder;
  const candidates = selected.map((entry) => {
    const guard = entry.avoidWhen?.length ? ` Avoid when: ${entry.avoidWhen.join(", ")}.` : "";
    return `- Candidate: “${entry.text}” Use only on a strong semantic match to: ${entry.useWhen.join(", ")}.${guard}`;
  });
  return `${reminder}\nOptional phrase candidates for this turn:\n${candidates.join("\n")}\nUse at most one. Never force a quotation.`;
}
