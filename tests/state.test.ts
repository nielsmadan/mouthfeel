import assert from "node:assert/strict";
import test from "node:test";

import { applyCommand } from "../src/core/state.js";
import type { CompiledProfile, MouthfeelSessionState } from "../src/core/types.js";

const profiles: CompiledProfile[] = [
  {
    id: "senior",
    displayName: "Senior",
    category: "practical",
    summary: "Terse technical communication",
    surpriseEligible: false,
    cards: { 1: "one", 2: "two", 3: "three" },
  },
  {
    id: "sailor",
    displayName: "Sailor",
    category: "fun",
    summary: "Wizened sailor",
    surpriseEligible: true,
    cards: { 1: "one", 2: "two", 3: "three" },
  },
];

const active: MouthfeelSessionState = {
  version: 1,
  profileId: "senior",
  intensity: 2,
  lastReplyStyled: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("activates prospectively and persists an off tombstone", () => {
  const activated = applyCommand(null, { type: "activate", profileId: "sailor", intensity: 3 }, profiles, {
    now: () => new Date("2026-02-01T00:00:00.000Z"),
    random: () => 0,
  });
  assert.equal(activated.state?.profileId, "sailor");
  assert.equal(activated.state?.lastReplyStyled, false);
  assert.equal(activated.effect, "profile-selected");
  assert.match(activated.instruction, /future replies/i);

  const off = applyCommand(active, { type: "off" }, profiles);
  assert.equal(off.state?.mode, "off");
  assert.equal(off.effect, "profile-disabled");
  assert.match(off.instruction, /off/i);
});

test("surprise resolves and persists an eligible profile", () => {
  const result = applyCommand(null, { type: "surprise", intensity: 1 }, profiles, {
    random: () => 0.99,
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });
  assert.equal(result.state?.profileId, "sailor");
  assert.equal(result.state?.intensity, 1);
});

test("untranslate keeps the profile active and is one-shot", () => {
  const result = applyCommand(active, { type: "untranslate" }, profiles);
  assert.equal(result.state?.profileId, "senior");
  assert.equal(result.state?.lastReplyStyled, false);
  assert.match(result.instruction, /rewrite the immediately preceding/i);

  const second = applyCommand(result.state, { type: "untranslate" }, profiles);
  assert.match(second.instruction, /nothing to untranslate/i);
});

test("intensity requires an active profile", () => {
  const result = applyCommand(null, { type: "intensity", intensity: 3 }, profiles);
  assert.equal(result.state, null);
  assert.match(result.instruction, /activate a profile/i);
});

test("neutral control replies are not eligible for untranslate", () => {
  const status = applyCommand(active, { type: "status" }, profiles);
  assert.equal(status.state?.lastReplyStyled, false);
  const result = applyCommand(status.state, { type: "untranslate" }, profiles);
  assert.match(result.instruction, /nothing to untranslate/i);
});

test("activating another profile replaces rather than stacks", () => {
  const result = applyCommand(active, { type: "activate", profileId: "sailor", intensity: 1 }, profiles);
  assert.equal(result.state?.profileId, "sailor");
  assert.equal(result.state?.intensity, 1);
  assert.equal(result.effect, "profile-selected");
});

test("disabled state behaves as off until another profile is selected", () => {
  const disabled = applyCommand(active, { type: "off" }, profiles).state;
  assert.ok(disabled);

  const status = applyCommand(disabled, { type: "status" }, profiles);
  assert.equal(status.notification, "Mouthfeel is off.");

  const intensity = applyCommand(disabled, { type: "intensity", intensity: 3 }, profiles);
  assert.match(intensity.notification, /activate a profile/i);
});
