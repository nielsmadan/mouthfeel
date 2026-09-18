import assert from "node:assert/strict";
import test from "node:test";

import { parseCommand, unwrapCommandPrompt } from "../src/core/commands.js";

test("parses profile activation and defaults to intensity one", () => {
  assert.deepEqual(parseCommand("sailor", ["sailor"]), {
    type: "activate",
    profileId: "sailor",
    intensity: 1,
  });
  assert.deepEqual(parseCommand("senior 2", ["senior"]), {
    type: "activate",
    profileId: "senior",
    intensity: 2,
  });
});

test("parses control actions", () => {
  assert.deepEqual(parseCommand("surprise 1", ["sailor"]), { type: "surprise", intensity: 1 });
  assert.deepEqual(parseCommand("intensity 2", ["sailor"]), { type: "intensity", intensity: 2 });
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
  assert.equal(unwrapCommandPrompt("MOUTHFEEL_COMMAND: sailor 2"), "sailor 2");
  assert.equal(
    unwrapCommandPrompt("<command-message>use</command-message>\n<command-name>/use</command-name>\n<command-args>sailor 2</command-args>"),
    null,
  );
  assert.equal(unwrapCommandPrompt("Tell me about mouthfeel in food"), null);
});

test("accepts the adapter marker only when it is the complete prompt", () => {
  assert.equal(unwrapCommandPrompt("MOUTHFEEL_COMMAND: off"), "off");
  assert.equal(unwrapCommandPrompt("A pasted example:\nMOUTHFEEL_COMMAND: off"), null);
  assert.equal(unwrapCommandPrompt("MOUTHFEEL_COMMAND: off\nContinue with the task"), null);
});

test("rejects invalid intensities without changing state", () => {
  assert.deepEqual(parseCommand("sailor 4", ["sailor"]), {
    type: "invalid",
    message: "Intensity must be 1 or 2.",
  });
  assert.deepEqual(parseCommand("sailor 3", ["sailor"]), {
    type: "invalid",
    message: "Intensity must be 1 or 2.",
  });
  assert.deepEqual(parseCommand("intensity 3", ["sailor"]), {
    type: "invalid",
    message: "Intensity must be 1 or 2.",
  });
});

test("reports arity problems as arity problems, not intensity range errors", () => {
  assert.deepEqual(parseCommand("sailor 1 extra", ["sailor"]), {
    type: "invalid",
    message: "Activation takes at most one intensity argument.",
  });
  assert.deepEqual(parseCommand("intensity", ["sailor"]), {
    type: "invalid",
    message: "The intensity action requires a value.",
  });
  assert.deepEqual(parseCommand("surprise 1 2", ["sailor"]), {
    type: "invalid",
    message: "The surprise action takes at most one intensity argument.",
  });
});
