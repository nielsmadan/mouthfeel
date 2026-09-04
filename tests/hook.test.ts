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
    phrases: [{
      text: "The tide has turned.",
      useWhen: ["ordering bug", "incorrect sequence"],
      minIntensity: 1,
    }],
  },
];

async function fixture(context: TestContext) {
  const root = await tempDirectory(context, "mouthfeel-hook-");
  return { store: new SidecarStore(root), profiles };
}

test("activation requests a brief greeting in the selected profile and ordinary turns stay quiet", async (context) => {
  const options = await fixture(context);
  const activation = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel sailor 2",
  }, options);
  assert.match(JSON.stringify(activation), /future replies/);
  assert.match(JSON.stringify(activation), /sailor two/);
  assert.match(JSON.stringify(activation), /supersedes every earlier Mouthfeel profile card/i);
  assert.match(JSON.stringify(activation), /activation greeting/i);
  assert.match(JSON.stringify(activation), /one to three short sentences/i);
  assert.match(JSON.stringify(activation), /without calling tools or inspecting files/i);
  assert.match(JSON.stringify(activation), /apply the selected profile to this greeting/i);

  const ordinary = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options);
  assert.equal(ordinary, null);
  assert.equal((await options.store.read("session"))?.lastReplyStyled, true);

  const next = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Continue",
  }, options);
  assert.equal(next, null);
});

test("an opted-in host reinforces the active profile on every ordinary turn", async (context) => {
  const options = { ...(await fixture(context)), remindOnEveryActiveTurn: true };
  await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel sailor 2",
  }, options);

  const ordinary = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options);

  assert.match(JSON.stringify(ordinary), /active for this reply/i);
  assert.match(JSON.stringify(ordinary), /each entire natural-language reply/i);
  assert.doesNotMatch(JSON.stringify(ordinary), /sailor two/);
});

test("returns an active reminder when refreshing its styled timestamp fails", async (context) => {
  const options = { ...(await fixture(context)), remindOnEveryActiveTurn: true };
  await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel sailor 2",
  }, options);
  options.store.write = async () => {
    throw new Error("state is read-only");
  };

  const ordinary = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options);

  assert.match(JSON.stringify(ordinary), /active for this reply/i);
});

test("an ordinary turn emits only strongly matched phrase candidates", async (context) => {
  const options = await fixture(context);
  await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel sailor 2",
  }, options);

  const ordinary = await handleHook({
    session_id: "session",
    hook_event_name: "UserPromptSubmit",
    prompt: "Diagnose this ordering bug and incorrect sequence",
  }, options);

  assert.match(JSON.stringify(ordinary), /The tide has turned/);
  assert.doesNotMatch(JSON.stringify(ordinary), /sailor two/);
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

test("untranslate can rewrite the immediately preceding activation greeting", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel sailor" }, options);

  const result = await handleHook({
    session_id: "s",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel untranslate",
  }, options);

  assert.match(JSON.stringify(result), /rewrite the immediately preceding assistant reply/i);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, false);
});

test("compaction restores active context", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior 3" }, options);
  const compact = await handleHook({ session_id: "s", hook_event_name: "SessionStart", source: "compact" }, options);
  assert.match(JSON.stringify(compact), /senior three/);
  assert.equal((await options.store.read("s"))?.lastReplyStyled, false);
});

test("off revokes prior cards and compaction restores that revocation", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel sailor 2" }, options);

  const disabled = await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel off" }, options);
  assert.match(JSON.stringify(disabled), /ignore every earlier Mouthfeel profile card/i);
  assert.equal((await options.store.read("s"))?.mode, "off");

  assert.equal(await handleHook({
    session_id: "s",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options), null);

  const compact = await handleHook({ session_id: "s", hook_event_name: "SessionStart", source: "compact" }, options);
  assert.match(JSON.stringify(compact), /ignore every earlier Mouthfeel profile card/i);
});

test("intensity stays neutral while surprise requests a styled greeting", async (context) => {
  const options = await fixture(context);
  await handleHook({ session_id: "intensity", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel senior 1" }, options);
  const intensity = await handleHook({
    session_id: "intensity",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel intensity 3",
  }, options);
  assert.match(JSON.stringify(intensity), /senior three/);
  assert.match(JSON.stringify(intensity), /supersedes every earlier Mouthfeel profile card/i);
  assert.match(JSON.stringify(intensity), /do not apply.*control response/i);
  assert.doesNotMatch(JSON.stringify(intensity), /activation greeting/i);

  const surprise = await handleHook({
    session_id: "surprise",
    hook_event_name: "UserPromptSubmit",
    prompt: "/mouthfeel surprise 1",
  }, { ...options, random: () => 0 });
  assert.match(JSON.stringify(surprise), /sailor one/);
  assert.match(JSON.stringify(surprise), /supersedes every earlier Mouthfeel profile card/i);
  assert.match(JSON.stringify(surprise), /activation greeting/i);
  assert.match(JSON.stringify(surprise), /apply the selected profile to this greeting/i);
});

test("does not load the profile registry for an inactive ordinary turn", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-hook-lazy-");
  let loads = 0;
  const options = {
    store: new SidecarStore(root),
    loadProfiles: async () => {
      loads += 1;
      return profiles;
    },
  };

  assert.equal(await handleHook({
    session_id: "s",
    hook_event_name: "UserPromptSubmit",
    prompt: "Explain the index",
  }, options), null);
  assert.equal(loads, 0);

  await handleHook({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "/mouthfeel sailor" }, options);
  assert.equal(loads, 1);
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
