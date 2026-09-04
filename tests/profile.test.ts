import assert from "node:assert/strict";
import test from "node:test";

import { loadProfiles } from "../src/core/load.js";
import {
  compileProfile,
  renderRuntimeCard,
  renderRuntimeReminder,
  selectPhrases,
  validateProfileSource,
  validateRoster,
} from "../src/core/profiles.js";
import type { ProfileSource } from "../src/core/types.js";

const source: ProfileSource = {
  version: 1,
  id: "sailor",
  displayName: "Sailor",
  category: "fun",
  summary: "Wizened sailor",
  surpriseEligible: true,
  baseContract: ["Preserve technical meaning."],
  markers: ["Address the user as a green crew member."],
  controlledImperfections: [],
  avoid: ["Do not obscure technical language."],
  intensity: {
    1: ["Light cadence."],
    2: ["Clear persona."],
    3: ["Strong persona."],
  },
};

test("compiles cumulative intensity cards with shared boundaries", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", []);
  assert.match(compiled.cards[1], /Light cadence/);
  assert.doesNotMatch(compiled.cards[1], /Clear persona/);
  assert.match(compiled.cards[2], /Light cadence/);
  assert.match(compiled.cards[2], /Clear persona/);
  assert.match(compiled.cards[3], /Strong persona/);
  assert.match(compiled.cards[3], /Do not style code/i);
});

test("rejects duplicate ids and a roster without practical profiles", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", []);
  assert.throws(() => validateRoster([compiled, compiled]), /duplicate/i);
  assert.throws(() => validateRoster([compiled]), /practical/i);
});

test("rejects a malformed compiled runtime registry", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", []);
  assert.throws(() => validateRoster([{ ...compiled, cards: { ...compiled.cards, 2: "" } }]), /intensity 2/i);
});

test("rejects malformed source instruction arrays", () => {
  assert.throws(() => validateProfileSource({ ...source, baseContract: [{ text: "not a string" }] }), /baseContract/i);
  assert.throws(() => validateProfileSource({
    ...source,
    intensity: { ...source.intensity, 2: [] },
  }), /intensity 2/i);
});

test("requires a strong phrase-bank match instead of one broad keyword", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", [{
    text: "Timeline got messed up.",
    useWhen: ["ordering bug", "race condition", "incorrect sequence"],
    minIntensity: 1,
  }]);
  assert.deepEqual(selectPhrases(compiled, 2, "There is a generic bug in data output"), []);
  assert.equal(selectPhrases(compiled, 2, "This ordering bug reverses the sequence").length, 1);
});

test("selects matching phrases by intensity, score, and stable limit", () => {
  const phrases = ["Delta", "Beta", "Alpha", "Charlie"].map((text) => ({
    text,
    useWhen: ["ordering bug", "sequence issue"],
    minIntensity: 1 as const,
  }));
  const compiled = compileProfile(source, "Use sailor cadence.", [
    ...phrases,
    { text: "High intensity", useWhen: ["ordering bug", "sequence issue"], minIntensity: 3 },
  ]);
  assert.deepEqual(
    selectPhrases(compiled, 2, "The ordering bug caused a sequence issue").map((phrase) => phrase.text),
    ["Alpha", "Beta", "Charlie"],
  );
  assert.equal(selectPhrases(compiled, 2, "The ordering bug caused a sequence issue", 10).some((phrase) => phrase.text === "High intensity"), false);
  assert.equal(selectPhrases(compiled, 3, "The ordering bug caused a sequence issue", 10).some((phrase) => phrase.text === "High intensity"), true);
});

test("renders phrase candidates and their guards in cards and reminders", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", [{
    text: "Timeline got messed up.",
    useWhen: ["ordering bug", "incorrect sequence"],
    avoidWhen: ["literal timeline output"],
    minIntensity: 1,
  }]);
  const prompt = "The ordering bug produced an incorrect sequence";
  const reminder = renderRuntimeReminder(compiled, 2, prompt);
  assert.ok(reminder);
  for (const rendered of [renderRuntimeCard(compiled, 2, prompt), reminder]) {
    assert.match(rendered, /Timeline got messed up/);
    assert.match(rendered, /Avoid when: literal timeline output/);
    assert.match(rendered, /at most one/i);
  }
});

test("omits per-turn reminders when no phrase candidate strongly matches", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", [{
    text: "Timeline got messed up.",
    useWhen: ["ordering bug", "incorrect sequence"],
    minIntensity: 1,
  }]);

  assert.equal(renderRuntimeReminder(compiled, 2, "Explain the index"), null);
});

test("can reinforce the complete profile on a turn without phrase candidates", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", []);
  const reminder = renderRuntimeReminder(compiled, 2, "Explain the index", { always: true });

  assert.ok(reminder);
  assert.match(reminder, /active for this reply/i);
  assert.match(reminder, /each entire natural-language reply/i);
  assert.match(reminder, /pass for the host's baseline voice/i);
  assert.doesNotMatch(reminder, /Use sailor cadence/);
});

test("keeps matching phrase candidates in an always-on reminder", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", [{
    text: "Timeline got messed up.",
    useWhen: ["ordering bug", "incorrect sequence"],
    minIntensity: 1,
  }]);
  const reminder = renderRuntimeReminder(
    compiled,
    2,
    "The ordering bug produced an incorrect sequence",
    { always: true },
  );

  assert.ok(reminder);
  assert.match(reminder, /each entire natural-language reply/i);
  assert.match(reminder, /Timeline got messed up/);
});

test("sailor intensity 2 requires the core explanation to stay in voice", async () => {
  const profiles = await loadProfiles("profiles");
  const sailor = profiles.find((profile) => profile.id === "sailor");
  assert.ok(sailor);
  assert.match(sailor.cards[2], /most prose sentences.*recognizably/i);
  assert.match(sailor.cards[2], /every prose paragraph/i);
  assert.match(sailor.cards[2], /silently rewrite/i);
  assert.match(sailor.cards[2], /ordinary assistant/i);
  assert.match(sailor.cards[2], /core explanatory sentences/i);
  assert.match(sailor.cards[2], /neutral technical prose.*nautical/i);
  assert.match(sailor.cards[2], /technical facts.*literal/i);
  assert.match(sailor.cards[2], /first and second person/i);
  assert.match(sailor.cards[2], /keep the imagined setting aboard ship/i);
});

test("sailor intensity 1 reserves sustained paragraph-level voice for intensity 2", async () => {
  const profiles = await loadProfiles("profiles");
  const sailor = profiles.find((profile) => profile.id === "sailor");
  assert.ok(sailor);
  assert.match(sailor.cards[1], /light touch/i);
  assert.match(sailor.cards[1], /typically use one crew address/i);
  assert.match(sailor.cards[1], /two or three distributed sentences/i);
  assert.match(sailor.cards[1], /old-hand guidance, experience, or dry judgment/i);
  assert.match(sailor.cards[1], /at most one maritime idiom or comparison/i);
  assert.match(sailor.cards[1], /faint eye-roll/i);
  assert.doesNotMatch(sailor.cards[1], /every prose paragraph/i);
  assert.match(sailor.cards[2], /every prose paragraph/i);
});

test("card and reminder share intensity-aware distribution guidance", () => {
  const compiled = compileProfile(source, "Use sailor cadence.", []);
  const light = /Keep the voice light at this intensity/;
  const full = /each entire natural-language reply/;

  assert.match(renderRuntimeCard(compiled, 1, ""), light);
  assert.doesNotMatch(renderRuntimeCard(compiled, 1, ""), full);
  assert.match(renderRuntimeCard(compiled, 3, ""), full);
  assert.doesNotMatch(renderRuntimeCard(compiled, 3, ""), light);

  const reminder1 = renderRuntimeReminder(compiled, 1, "Explain the index", { always: true });
  const reminder3 = renderRuntimeReminder(compiled, 3, "Explain the index", { always: true });
  assert.ok(reminder1 && light.test(reminder1) && !full.test(reminder1));
  assert.ok(reminder3 && full.test(reminder3) && !light.test(reminder3));
});
