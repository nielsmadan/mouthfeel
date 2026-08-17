import assert from "node:assert/strict";
import test from "node:test";

import { parseCommand, unwrapCommandPrompt } from "../src/core/commands.js";

test("parses profile activation and defaults to intensity two", () => {
  assert.deepEqual(parseCommand("sailor", ["sailor"]), {
    type: "activate",
    profileId: "sailor",
    intensity: 2,
  });
  assert.deepEqual(parseCommand("senior 3", ["senior"]), {
    type: "activate",
    profileId: "senior",
    intensity: 3,
  });
});

test("parses control actions", () => {
  assert.deepEqual(parseCommand("surprise 1", ["sailor"]), { type: "surprise", intensity: 1 });
  assert.deepEqual(parseCommand("intensity 3", ["sailor"]), { type: "intensity", intensity: 3 });
  assert.deepEqual(parseCommand("off", ["sailor"]), { type: "off" });
  assert.deepEqual(parseCommand("status", ["sailor"]), { type: "status" });
  assert.deepEqual(parseCommand("list", ["sailor"]), { type: "list" });
  assert.deepEqual(parseCommand("untranslate", ["sailor"]), { type: "untranslate" });
});

test("suggests the nearest profile for an unknown id", () => {
  assert.deepEqual(parseCommand("sailr", ["sailor", "senior"]), {
    type: "invalid",
    message: 'Unknown profile "sailr". Did you mean "sailor"?',
  });
});

test("unwraps native host command forms", () => {
  assert.equal(unwrapCommandPrompt("/mouthfeel sailor 2"), "sailor 2");
  assert.equal(unwrapCommandPrompt("/mouthfeel:use sailor 2"), "sailor 2");
  assert.equal(unwrapCommandPrompt("$mouthfeel:use sailor 2"), "sailor 2");
  assert.equal(
    unwrapCommandPrompt(
      "<command-message>use</command-message>\n<command-name>/mouthfeel:use</command-name>\n<command-args>sailor 2</command-args>",
    ),
    "sailor 2",
  );
  assert.equal(unwrapCommandPrompt("MOUTHFEEL_COMMAND: sailor 2\nIgnore this fixed template."), "sailor 2");
  assert.equal(
    unwrapCommandPrompt("<command-message>use</command-message>\n<command-name>/use</command-name>\n<command-args>sailor 2</command-args>"),
    null,
  );
  assert.equal(unwrapCommandPrompt("Tell me about mouthfeel in food"), null);
});

test("rejects invalid intensities without changing state", () => {
  assert.deepEqual(parseCommand("sailor 4", ["sailor"]), {
    type: "invalid",
    message: "Intensity must be 1, 2, or 3.",
  });
});
