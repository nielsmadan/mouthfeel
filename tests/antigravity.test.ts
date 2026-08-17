import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { latestUserText } from "../src/adapters/antigravity-hook.js";
import { runNode, tempDirectory } from "./helpers.js";

const hook = resolve("dist/antigravity/mouthfeel/runtime/hook.mjs");

test("finds the latest user-authored transcript entry", () => {
  const transcript = [
    JSON.stringify({ role: "user", content: "old" }),
    JSON.stringify({ role: "assistant", content: "reply" }),
    JSON.stringify({ type: "user_message", parts: [{ text: "MOUTHFEEL_COMMAND: sailor 2" }] }),
  ].join("\n");
  assert.match(latestUserText(transcript), /sailor 2/);
});

test("Antigravity persists activation, styles future turns, and resets scheduled eligibility", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-antigravity-");
  const transcriptPath = join(root, "transcript.jsonl");
  const invoke = async (prompt: string) => {
    await writeFile(transcriptPath, `${JSON.stringify({ role: "user", content: prompt })}\n`);
    return runNode(hook, JSON.stringify({
      conversationId: "conversation",
      transcriptPath,
      artifactDirectoryPath: root,
      invocationNum: 0,
    }));
  };

  const activation = await invoke("MOUTHFEEL_COMMAND: sailor 2");
  assert.equal(activation.code, 0, activation.stderr);
  assert.match(activation.stdout, /future replies/i);
  assert.doesNotMatch(activation.stdout, /Mouthfeel: Sailor/);

  const ordinary = await invoke("Explain the index");
  assert.equal(ordinary.code, 0, ordinary.stderr);
  assert.match(ordinary.stdout, /Mouthfeel: Sailor \(intensity 2\)/);

  const scheduled = await invoke("<scheduled-task>run unattended</scheduled-task>");
  assert.equal(scheduled.stdout, "{}\n");

  const untranslate = await invoke("MOUTHFEEL_COMMAND: untranslate");
  assert.match(untranslate.stdout, /nothing to untranslate/i);
});

test("Antigravity returns an empty response for malformed hook input", async () => {
  const result = await runNode(hook, "{}");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "{}\n");
});
