import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";

import { createOpenCodePlugin } from "../src/adapters/opencode.js";
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

async function plugin(stateRoot: string): Promise<Hooks> {
  return createOpenCodePlugin(profiles, { stateRoot })({} as PluginInput);
}

async function command(hooks: Hooks, sessionID: string, arguments_: string): Promise<void> {
  const handler = hooks["command.execute.before"];
  assert.ok(handler);
  await handler({ command: "mouthfeel", sessionID, arguments: arguments_ }, { parts: [] });
}

async function message(hooks: Hooks, sessionID: string, text: string): Promise<void> {
  const handler = hooks["chat.message"];
  assert.ok(handler);
  await handler({ sessionID }, {
    message: {} as never,
    parts: [{ type: "text", text } as never],
  });
}

async function transform(hooks: Hooks, sessionID: string): Promise<string[]> {
  const handler = hooks["experimental.chat.system.transform"];
  assert.ok(handler);
  const output = { system: [] as string[] };
  await handler({ sessionID, model: {} as never }, output);
  return output.system;
}

async function transformMessages(
  hooks: Hooks,
  messages: Array<{
    info: { id: string; sessionID: string; role: "user" | "assistant" };
    parts: Array<{ type: "text"; text: string }>;
  }>,
): Promise<void> {
  const handler = hooks["experimental.chat.messages.transform"];
  assert.ok(handler);
  await handler({}, { messages: messages as never });
}

test("OpenCode registers /mouthfeel and requests a brief greeting in the selected profile", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  const config = {} as Config;
  assert.ok(hooks.config);
  await hooks.config(config);
  assert.ok(config.command?.mouthfeel);
  assert.equal(config.command.mouthfeel.template, "/mouthfeel $ARGUMENTS");

  await command(hooks, "s", "senior 2");
  await message(hooks, "s", "/mouthfeel senior 2");
  const titleControl = (await transform(hooks, "s")).join("\n");
  const mainControl = (await transform(hooks, "s")).join("\n");
  assert.match(titleControl, /activation greeting/i);
  assert.match(mainControl, /activation greeting/i);
  assert.match(mainControl, /one to three short sentences/i);
  assert.match(mainControl, /without calling tools or inspecting files/i);
  assert.match(mainControl, /senior two/);

  await message(hooks, "s", "Diagnose it");
  const ordinary = (await transform(hooks, "s")).join("\n");
  assert.match(ordinary, /senior two/);
  assert.doesNotMatch(ordinary, /activation greeting/i);
});

test("OpenCode keeps intensity acknowledgements neutral", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "senior 1");
  await transform(hooks, "s");

  await command(hooks, "s", "intensity 3");
  const control = (await transform(hooks, "s")).join("\n");
  assert.match(control, /neutral baseline voice/i);
  assert.match(control, /Mouthfeel intensity 3/i);
  assert.doesNotMatch(control, /activation greeting/i);
});

test("OpenCode surprise requests a greeting in the selected profile", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);

  await command(hooks, "s", "surprise 1");
  const control = (await transform(hooks, "s")).join("\n");

  assert.match(control, /activation greeting/i);
  assert.match(control, /sailor one/i);
  assert.match(control, /Surprise selected sailor, intensity 1/i);
});

test("OpenCode untranslate can rewrite the preceding activation greeting", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "senior");
  await transform(hooks, "s");

  await command(hooks, "s", "untranslate");

  assert.match((await transform(hooks, "s")).join("\n"), /rewrite the immediately preceding assistant reply/i);
});

test("OpenCode makes untranslate an explicit rewrite request only in model context", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "sailor 1");
  await message(hooks, "s", "/mouthfeel sailor 1");
  await transform(hooks, "s");
  await message(hooks, "s", "Explain HTTP briefly");
  await transform(hooks, "s");
  await command(hooks, "s", "untranslate");
  await message(hooks, "s", "/mouthfeel untranslate");

  const transcript = [
    {
      info: { id: "previous", sessionID: "s", role: "assistant" as const },
      parts: [{ type: "text" as const, text: "Aye, HTTP is how browser and server trade messages." }],
    },
    {
      info: { id: "current", sessionID: "s", role: "user" as const },
      parts: [{ type: "text" as const, text: "/mouthfeel untranslate" }],
    },
  ];
  const modelMessages = structuredClone(transcript);

  await transformMessages(hooks, modelMessages);

  assert.equal(transcript[1]?.parts[0]?.text, "/mouthfeel untranslate");
  assert.equal(modelMessages[0]?.parts[0]?.text, "Aye, HTTP is how browser and server trade messages.");
  assert.match(modelMessages[1]?.parts[0]?.text ?? "", /rewrite the immediately preceding assistant reply/i);
});

test("OpenCode marks historical untranslate commands as one-shot", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "sailor 1");
  await message(hooks, "s", "/mouthfeel sailor 1");
  await transform(hooks, "s");
  await message(hooks, "s", "Explain HTTP briefly");
  await transform(hooks, "s");
  await command(hooks, "s", "untranslate");
  await message(hooks, "s", "/mouthfeel untranslate");
  await transform(hooks, "s");
  await message(hooks, "s", "And how does tmux fit?");

  const modelMessages = [
    {
      info: { id: "control", sessionID: "s", role: "user" as const },
      parts: [{ type: "text" as const, text: "/mouthfeel untranslate" }],
    },
    {
      info: { id: "rewrite", sessionID: "s", role: "assistant" as const },
      parts: [{ type: "text" as const, text: "HTTP is a request-response protocol." }],
    },
    {
      info: { id: "current", sessionID: "s", role: "user" as const },
      parts: [{ type: "text" as const, text: "And how does tmux fit?" }],
    },
  ];

  await transformMessages(hooks, modelMessages);

  assert.match(modelMessages[0]?.parts[0]?.text ?? "", /one-shot/i);
  assert.match(modelMessages[0]?.parts[0]?.text ?? "", /did not disable or alter the active profile/i);
  assert.equal(modelMessages[2]?.parts[0]?.text, "And how does tmux fit?");
  assert.match((await transform(hooks, "s")).join("\n"), /sailor one/i);
});

test("OpenCode restores persisted state after plugin recreation", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const first = await plugin(root);
  await command(first, "s", "senior 3");
  await transform(first, "s");

  const restored = await plugin(root);
  await message(restored, "s", "Continue");
  assert.match((await transform(restored, "s")).join("\n"), /senior three/);
});

test("OpenCode restores an off tombstone without styling later replies", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const first = await plugin(root);
  await command(first, "s", "senior");
  await transform(first, "s");
  await command(first, "s", "off");
  assert.match((await transform(first, "s")).join("\n"), /Mouthfeel is off/i);

  const restored = await plugin(root);
  await message(restored, "s", "Continue");
  assert.deepEqual(await transform(restored, "s"), []);
  assert.equal((await new SidecarStore(root).read("s"))?.mode, "off");
});

test("OpenCode scheduled tasks clear untranslate eligibility", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "senior");
  await transform(hooks, "s");
  await message(hooks, "s", "Style this reply");
  await transform(hooks, "s");

  await message(hooks, "s", "<scheduled-task>background</scheduled-task>");
  assert.deepEqual(await transform(hooks, "s"), []);
  await command(hooks, "s", "untranslate");
  assert.match((await transform(hooks, "s")).join("\n"), /nothing to untranslate/i);
});

test("OpenCode reports persistence failures instead of claiming activation", async (context) => {
  const parent = await tempDirectory(context, "mouthfeel-opencode-error-");
  const stateRoot = join(parent, "state-file");
  await writeFile(stateRoot, "not a directory");
  const hooks = await plugin(stateRoot);

  await command(hooks, "s", "senior");
  const result = (await transform(hooks, "s")).join("\n");
  assert.match(result, /could not update its saved state/i);
  assert.doesNotMatch(result, /future replies/i);
});

test("OpenCode removes persisted state when a session is deleted", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  await command(hooks, "s", "senior");
  assert.ok(await new SidecarStore(root).read("s"));

  assert.ok(hooks.event);
  await hooks.event({
    event: { type: "session.deleted", properties: { info: { id: "s" } } } as never,
  });
  assert.equal(await new SidecarStore(root).read("s"), null);
});
