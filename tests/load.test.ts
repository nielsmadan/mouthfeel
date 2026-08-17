import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadProfiles } from "../src/core/load.js";

test("loads the complete v1 roster", async () => {
  const profiles = await loadProfiles(resolve("profiles"));
  assert.equal(profiles.length, 18);
  assert.deepEqual(
    profiles.filter((profile) => profile.category === "practical").map((profile) => profile.id),
    ["junior", "mentor", "po", "senior"],
  );
  assert.equal(profiles.filter((profile) => profile.surpriseEligible).length, 14);
  assert.ok(profiles.every((profile) => profile.cards[1] && profile.cards[2] && profile.cards[3]));
  assert.doesNotMatch(profiles.map((profile) => Object.values(profile.cards).join("\n")).join("\n"), /\[object Object\]/);
});
