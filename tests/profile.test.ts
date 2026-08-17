import assert from "node:assert/strict";
import test from "node:test";

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
  for (const rendered of [renderRuntimeCard(compiled, 2, prompt), renderRuntimeReminder(compiled, 2, prompt)]) {
    assert.match(rendered, /Timeline got messed up/);
    assert.match(rendered, /Avoid when: literal timeline output/);
    assert.match(rendered, /at most one/i);
  }
});
