import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";

import { handleHook } from "../src/runtime/hook.js";
import { SidecarStore } from "../src/core/storage.js";
import type { CompiledProfile } from "../src/core/types.js";
import { tempDirectory } from "./helpers.js";

const profiles: CompiledProfile[] = [
  {
    id: "senior",
    displayName: "Senior",
    category: "practical",
    summary: "Terse",
    surpriseEligible: false,
    cards: { 1: "senior one", 2: "senior two", 3: "senior three" },
  },
  {
    id: "sailor",
    displayName: "Sailor",
    category: "fun",
    summary: "Sea dog",
    surpriseEligible: true,
    cards: { 1: "sailor one", 2: "sailor two", 3: "sailor three" },
  },
];

async function fixture(context: TestContext) {
  const root = await tempDirectory(context, "mouthfeel-hook-");
  return { store: new SidecarStore(root), profiles };
}

test("activation is prospective and the next prompt receives the card", async (context) => {
  const options = await fixture(context);
  const activation = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel sailor 2",
  }, options);
  assert.match(JSON.stringify(activation), /future replies/);
  assert.doesNotMatch(JSON.stringify(activation), /sailor two/);

  const ordinary = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options);
  assert.match(JSON.stringify(ordinary), /sailor two/);
  assert.equal((await options.store.read("session"))?.lastReplyStyled, true);

  const next = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue",
  }, options);
  assert.match(JSON.stringify(next), /Mouthfeel remains active/);
  assert.doesNotMatch(JSON.stringify(next), /sailor two/);
});

test("untranslate bypasses the active card once and preserves state", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel sailor" }, options);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "Ship it" }, options);
  const result = await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel untranslate" }, options);
  assert.match(JSON.stringify(result), /immediately preceding/);
  assert.doesNotMatch(JSON.stringify(result), /sailor two/);
  assert.equal((await options.store.read("s"))?.profileId, "sailor");
});

test("compaction restores active context", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior 3" }, options);
  const compact = await handleHook({ session_id: "s", hook_event_name: "SessionStart", source: "compact" }, options);
  assert.match(JSON.stringify(compact), /senior three/);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, false);
});

test("resume restores persisted active context without changing styled state", async (context) => {
  const options = await fixture(context);
  await options.store.write("s", {
    version: 1,
    profileId: "senior",
    intensity: 3,
    lastReplyStyled: true,
    updatedAt: "2026-02-01T00:00:00.000Z",
  });
  const resumed = await handleHook({ session_id: "s", hook_event_name: "SessionStart", source: "resume" }, options);
  assert.match(JSON.stringify(resumed), /senior three/);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, true);
});

test("scheduled tasks clear untranslate eligibility", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior 3" }, options);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "Explain it" }, options);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, true);
  assert.equal(await handleHook({
    session_id: "s",
    hook_event_name: "UserPromptSubmit",
    prompt: "<scheduled-task>run unattended</scheduled-task>",
  }, options), null);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, false);
});

test("clear starts a fresh baseline conversation even if the host reuses an id", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior" }, options);
  await handleHook({ session_id: "s", hook_event_name: "SessionStart", source: "clear" }, options);
  assert.equal(await options.store.read("s"), null);
});

test("concurrent sessions keep independent profiles", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "one", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel sailor 1" }, options);
  await handleHook({ session_id: "two", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior 3" }, options);
  assert.equal((await options.store.read("one"))?.profileId, "sailor");
  assert.equal((await options.store.read("two"))?.profileId, "senior");
});
