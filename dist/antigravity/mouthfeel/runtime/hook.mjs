// src/adapters/antigravity-hook.ts
import { open as open2, stat as stat2 } from "node:fs/promises";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/core/commands.ts
var ACTIONS = /* @__PURE__ */ new Set(["surprise", "intensity", "off", "status", "list", "untranslate"]);
function parseIntensity(raw) {
  if (raw === void 0 || raw === "") return 2;
  if (raw === "1" || raw === "2" || raw === "3") return Number(raw);
  return null;
}
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[b.length] ?? a.length;
}
function nearestProfile(value, profileIds) {
  return profileIds.map((id) => ({ id, score: distance(value, id) })).sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))[0]?.id ?? null;
}
function parseCommand(raw, profileIds) {
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const action = parts[0];
  if (!action) return { type: "invalid", message: "Usage: mouthfeel <profile> [1|2|3] or mouthfeel <action>." };
  if (action === "off" || action === "status" || action === "list" || action === "untranslate") {
    if (parts.length > 1) return { type: "invalid", message: `The ${action} action takes no arguments.` };
    return { type: action };
  }
  if (action === "surprise") {
    const intensity2 = parseIntensity(parts[1]);
    if (intensity2 === null || parts.length > 2) return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
    return { type: "surprise", intensity: intensity2 };
  }
  if (action === "intensity") {
    const intensity2 = parseIntensity(parts[1]);
    if (parts[1] === void 0 || intensity2 === null || parts.length > 2) {
      return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
    }
    return { type: "intensity", intensity: intensity2 };
  }
  if (ACTIONS.has(action)) return { type: "invalid", message: `Invalid ${action} command.` };
  if (!profileIds.includes(action)) {
    const suggestion = nearestProfile(action, profileIds);
    return {
      type: "invalid",
      message: suggestion ? `Unknown profile "${action}". Did you mean "${suggestion}"?` : `Unknown profile "${action}".`
    };
  }
  const intensity = parseIntensity(parts[1]);
  if (intensity === null || parts.length > 2) return { type: "invalid", message: "Intensity must be 1, 2, or 3." };
  return { type: "activate", profileId: action, intensity };
}
function unwrapCommandPrompt(prompt) {
  const commandArgs = prompt.match(/<command-args>([\s\S]*?)<\/command-args>/i)?.[1];
  const commandName = prompt.match(/<command-name>\s*\/?([^<]+)<\/command-name>/i)?.[1]?.trim().toLowerCase();
  if (commandName === "mouthfeel:use" || commandName === "mouthfeel") {
    return commandArgs?.trim() ?? "";
  }
  const marker = prompt.trim().match(/^MOUTHFEEL_COMMAND:[ \t]*([^\r\n]*)$/i)?.[1];
  if (marker !== void 0) return marker.trim();
  const direct = prompt.trim().match(/^(?:\/mouthfeel(?::use)?|\$mouthfeel:use)(?:\s+([\s\S]*))?$/i);
  if (direct) return direct[1]?.trim() ?? "";
  return null;
}

// src/core/profiles.ts
var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function strings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must contain only strings`);
  }
  return value;
}
function optionalString(value, label) {
  if (value !== void 0 && typeof value !== "string") throw new Error(`${label} must be a string`);
}
function validatePhraseEntries(value, profileId) {
  if (!Array.isArray(value)) throw new Error(`${profileId}: phrases must be an array`);
  for (const [index, item] of value.entries()) {
    const phrase = record(item, `${profileId}: phrase ${index + 1}`);
    string(phrase.text, `${profileId}: phrase ${index + 1} text`);
    strings(phrase.useWhen, `${profileId}: phrase ${index + 1} useWhen`);
    if (phrase.avoidWhen !== void 0) strings(phrase.avoidWhen, `${profileId}: phrase ${index + 1} avoidWhen`);
    if (phrase.minIntensity !== 1 && phrase.minIntensity !== 2 && phrase.minIntensity !== 3) {
      throw new Error(`${profileId}: phrase ${index + 1} minIntensity must be 1, 2, or 3`);
    }
    optionalString(phrase.meaning, `${profileId}: phrase ${index + 1} meaning`);
    optionalString(phrase.source, `${profileId}: phrase ${index + 1} source`);
    optionalString(phrase.speaker, `${profileId}: phrase ${index + 1} speaker`);
  }
}
function validateRoster(value) {
  if (!Array.isArray(value)) throw new Error("registry must contain an array");
  const profiles = value;
  const ids = /* @__PURE__ */ new Set();
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
    for (const level of [1, 2, 3]) {
      if (typeof cards[level] !== "string" || !cards[level].trim()) {
        throw new Error(`${id}: missing intensity ${level} card`);
      }
    }
    if (profile.phrases !== void 0) validatePhraseEntries(profile.phrases, id);
    ids.add(id);
  }
  if (!profiles.some((profile) => record(profile, "compiled profile").category === "practical")) {
    throw new Error("roster must include practical profiles");
  }
  if (!profiles.some((profile) => record(profile, "compiled profile").category === "fun")) {
    throw new Error("roster must include fun profiles");
  }
}
function terms(value) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}
function selectPhrases(profile, intensity, prompt, limit = 3) {
  const promptTerms = terms(prompt);
  return (profile.phrases ?? []).filter((entry) => entry.minIntensity <= intensity).map((entry) => ({
    entry,
    score: entry.useWhen.reduce((total, value) => {
      for (const term of terms(value)) if (promptTerms.has(term)) total += 1;
      return total;
    }, 0)
  })).filter(({ score }) => score >= 2).sort((left, right) => right.score - left.score || left.entry.text.localeCompare(right.entry.text)).slice(0, limit).map(({ entry }) => entry);
}
function renderPhraseCandidate(entry) {
  const guard = entry.avoidWhen?.length ? ` Avoid when: ${entry.avoidWhen.join(", ")}.` : "";
  return `- Candidate: \u201C${entry.text}\u201D Use only on a strong semantic match to: ${entry.useWhen.join(", ")}.${guard}`;
}
function distributionLine(intensity) {
  return intensity === 1 ? "Keep the voice light at this intensity: a few unmistakable touches spread across the reply are enough, and most sentences may stay close to the host baseline." : "Apply it to each entire natural-language reply \u2014 long, structured, and technical explanations included \u2014 not only to openings and closings. Before sending, rewrite prose that could pass for the host's baseline voice.";
}
function renderRuntimeCard(profile, intensity, prompt) {
  const selected = selectPhrases(profile, intensity, prompt);
  const card = `This card supersedes every earlier Mouthfeel profile card. Follow only this Mouthfeel profile.

The profile stays active for every future reply until it is changed or turned off. ${distributionLine(intensity)}

${profile.cards[intensity]}`;
  if (selected.length === 0) return card;
  const phraseLines = selected.map(renderPhraseCandidate);
  return `${card}

## Optional phrase candidates
${phraseLines.join("\n")}
Use at most one candidate. Never force a quotation.`;
}

// src/core/registry.ts
import { readFile } from "node:fs/promises";
async function loadRegistry(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  validateRoster(value);
  return value;
}

// src/core/state.ts
function notify(state, instruction, notification, effect = "notify") {
  return { state, instruction, notification, effect };
}
function greet(state, notification) {
  return {
    state,
    instruction: `Respond exactly: ${notification}`,
    notification,
    effect: "profile-greeting"
  };
}
function newState(profileId, intensity, now) {
  return {
    version: 1,
    mode: "active",
    profileId,
    intensity,
    lastReplyStyled: false,
    updatedAt: now().toISOString()
  };
}
function touch(state, now, patch) {
  return { ...state, ...patch, updatedAt: now().toISOString() };
}
function activeSessionState(state) {
  return state?.mode === "off" ? null : state;
}
function neutralState(state, now) {
  const active = activeSessionState(state);
  if (active) return touch(active, now, { lastReplyStyled: false });
  return state ? { ...state, updatedAt: now().toISOString() } : null;
}
function applyCommand(state, command, profiles, options = {}) {
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const random = options.random ?? Math.random;
  if (command.type === "invalid") {
    return notify(
      neutralState(state, now),
      `Respond exactly: ${command.message}`,
      command.message
    );
  }
  if (command.type === "off") {
    return notify({
      version: 1,
      mode: "off",
      lastReplyStyled: false,
      updatedAt: now().toISOString()
    }, "Respond exactly: Mouthfeel is off.", "Mouthfeel is off.", "profile-disabled");
  }
  if (command.type === "list") {
    const practical = profiles.filter((profile) => profile.category === "practical");
    const fun = profiles.filter((profile) => profile.category === "fun");
    const format = (profile) => `${profile.id} \u2014 ${profile.summary}`;
    const notification = `Practical:
${practical.map(format).join("\n")}
Fun:
${fun.map(format).join("\n")}`;
    return notify(
      neutralState(state, now),
      `Reply neutrally with this profile list:
${notification}`,
      notification
    );
  }
  if (command.type === "status") {
    const active2 = activeSessionState(state);
    const notification = active2 ? `Mouthfeel: ${active2.profileId}, intensity ${active2.intensity}.` : "Mouthfeel is off.";
    return notify(
      neutralState(state, now),
      `Respond exactly: ${notification}`,
      notification
    );
  }
  if (command.type === "activate") {
    const notification = `Mouthfeel: ${command.profileId}, intensity ${command.intensity}. This applies to future replies.`;
    return greet(
      newState(command.profileId, command.intensity, now),
      notification
    );
  }
  if (command.type === "surprise") {
    const eligible = profiles.filter((profile2) => profile2.surpriseEligible);
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
      notification
    );
  }
  if (command.type === "intensity") {
    const active2 = activeSessionState(state);
    if (!active2) {
      return notify(state, "Respond exactly: Activate a profile before changing intensity.", "Activate a profile before changing intensity.");
    }
    const notification = `Mouthfeel intensity ${command.intensity}. This applies to future replies.`;
    return notify(
      touch(active2, now, { intensity: command.intensity, lastReplyStyled: false }),
      `Respond exactly: ${notification}`,
      notification,
      "profile-selected"
    );
  }
  const active = activeSessionState(state);
  if (!active?.lastReplyStyled) {
    return notify(state, "Respond exactly: There is nothing to untranslate.", "There is nothing to untranslate.");
  }
  return {
    state: touch(active, now, { lastReplyStyled: false }),
    instruction: "Do not apply Mouthfeel to this control turn. Rewrite the immediately preceding assistant reply in the host baseline voice. Preserve every fact, conclusion, caveat, code block, command, exact quote, and requested format. Output only the rewritten reply. Keep the active Mouthfeel profile for future replies.",
    notification: "Rewriting the previous reply without Mouthfeel.",
    effect: "rewrite-previous"
  };
}
function markStyled(state, now = () => /* @__PURE__ */ new Date()) {
  return touch(state, now, { lastReplyStyled: true });
}

// src/core/storage.ts
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
var MAX_STATE_BYTES = 8192;
var MAX_AGE_MS = 90 * 24 * 60 * 60 * 1e3;
function isIntensity(value) {
  return value === 1 || value === 2 || value === 3;
}
function isSessionState(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  if (candidate.version !== 1 || typeof candidate.updatedAt !== "string" || Number.isNaN(Date.parse(candidate.updatedAt))) {
    return false;
  }
  if (candidate.mode === "off") {
    return candidate.lastReplyStyled === false && candidate.profileId === void 0 && candidate.intensity === void 0;
  }
  return candidate.version === 1 && (candidate.mode === void 0 || candidate.mode === "active") && typeof candidate.profileId === "string" && candidate.profileId.length <= 64 && isIntensity(candidate.intensity) && typeof candidate.lastReplyStyled === "boolean" && typeof candidate.updatedAt === "string";
}
var SidecarStore = class {
  constructor(root) {
    this.root = root;
  }
  pathFor(sessionId) {
    const name = createHash("sha256").update(sessionId).digest("hex");
    return join(this.root, `${name}.json`);
  }
  async ensureRoot() {
    await mkdir(this.root, { recursive: true, mode: 448 });
    const info = await lstat(this.root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("state root must be a real directory");
    await chmod(this.root, 448).catch(() => void 0);
  }
  async read(sessionId) {
    try {
      const path = this.pathFor(sessionId);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_STATE_BYTES) return null;
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      const handle = await open(path, constants.O_RDONLY | noFollow);
      try {
        const raw = await handle.readFile({ encoding: "utf8" });
        const parsed = JSON.parse(raw);
        return isSessionState(parsed) ? parsed : null;
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }
  async write(sessionId, state) {
    if (!isSessionState(state)) throw new Error("invalid Mouthfeel session state");
    await this.ensureRoot();
    const path = this.pathFor(sessionId);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("state target must be a regular file");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const raw = `${JSON.stringify(state)}
`;
    if (Buffer.byteLength(raw) > MAX_STATE_BYTES) throw new Error("state exceeds size cap");
    const temporary = join(this.root, `.${createHash("sha256").update(`${sessionId}:${process.pid}:${Date.now()}`).digest("hex")}.tmp`);
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    try {
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 384);
      try {
        await handle.writeFile(raw, { encoding: "utf8" });
        await handle.chmod(384).catch(() => void 0);
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch(() => void 0);
    }
  }
  async delete(sessionId) {
    const path = this.pathFor(sessionId);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) return;
      await unlink(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  async prune(now = /* @__PURE__ */ new Date()) {
    await this.ensureRoot();
    let removed = 0;
    for (const name of await readdir(this.root)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const path = join(this.root, name);
      const info = await lstat(path).catch(() => null);
      if (!info || info.isSymbolicLink() || !info.isFile()) continue;
      const details = await stat(path);
      if (now.getTime() - details.mtimeMs <= MAX_AGE_MS) continue;
      await unlink(path);
      removed += 1;
    }
    return removed;
  }
};

// src/adapters/antigravity-hook.ts
function collectStrings(value, result) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, result);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, result);
  }
}
function collectText(value, result) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) for (const item of value) collectText(item, result);
  else if (value && typeof value === "object") {
    const entry = value;
    for (const key of ["content", "message", "parts", "text", "prompt"]) collectText(entry[key], result);
  }
}
function looksUserAuthored(value) {
  const labels = [];
  for (const key of ["role", "author", "type", "kind"]) collectStrings(value[key], labels);
  return labels.some((label) => /(^|[_ -])user($|[_ -])|human/i.test(label));
}
function latestUserText(raw) {
  const lines = raw.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index] ?? "");
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value;
      if (!looksUserAuthored(entry)) continue;
      const strings2 = [];
      collectText(entry, strings2);
      return strings2.join("\n");
    } catch {
      continue;
    }
  }
  return "";
}
async function readTranscriptTail(path) {
  const details = await stat2(path);
  const length = Math.min(details.size, 131072);
  const buffer = Buffer.alloc(length);
  const handle = await open2(path, "r");
  try {
    await handle.read(buffer, 0, length, details.size - length);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}
async function main() {
  try {
    const rawInput = await new Promise((resolveInput) => {
      const chunks = [];
      process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      process.stdin.on("end", () => resolveInput(Buffer.concat(chunks).toString("utf8")));
    });
    const input = JSON.parse(rawInput);
    if (!input.conversationId || !input.transcriptPath) {
      process.stdout.write("{}\n");
      return;
    }
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const profiles = await loadRegistry(join2(packageRoot, "registry.json"));
    const store = new SidecarStore(input.artifactDirectoryPath ? join2(input.artifactDirectoryPath, ".mouthfeel") : join2(packageRoot, ".state"));
    await store.prune().catch(() => void 0);
    const state = await store.read(input.conversationId);
    const prompt = latestUserText(await readTranscriptTail(input.transcriptPath));
    const rawCommand = input.invocationNum === 0 ? unwrapCommandPrompt(prompt) : null;
    if (rawCommand !== null) {
      const result = applyCommand(
        state,
        parseCommand(rawCommand, profiles.map((profile2) => profile2.id)),
        profiles
      );
      if (result.state) await store.write(input.conversationId, result.state);
      else await store.delete(input.conversationId);
      process.stdout.write(`${JSON.stringify({
        injectSteps: [{ ephemeralMessage: `This is a neutral Mouthfeel control turn.
${result.instruction}` }]
      })}
`);
      return;
    }
    if (/<scheduled-task\b/i.test(prompt)) {
      const active2 = activeSessionState(state);
      if (active2?.lastReplyStyled) await store.write(input.conversationId, {
        ...active2,
        lastReplyStyled: false,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      process.stdout.write("{}\n");
      return;
    }
    const active = activeSessionState(state);
    if (!active) {
      process.stdout.write("{}\n");
      return;
    }
    const profile = profiles.find((candidate) => candidate.id === active.profileId);
    if (!profile) {
      await store.delete(input.conversationId);
      process.stdout.write("{}\n");
      return;
    }
    await store.write(input.conversationId, markStyled(active));
    process.stdout.write(`${JSON.stringify({
      injectSteps: [{ ephemeralMessage: renderRuntimeCard(profile, active.intensity, prompt) }]
    })}
`);
  } catch (error) {
    process.stderr.write(`mouthfeel: ${error instanceof Error ? error.message : String(error)}
`);
    process.stdout.write("{}\n");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
export {
  latestUserText
};
