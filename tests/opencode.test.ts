import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { Config, Hooks, PluginInput } from "@opencode-ai/plugin";

import { createOpenCodePlugin } from "../src/adapters/opencode.js";
import { SidecarStore } from "../src/core/storage.js";
import type { CompiledProfile } from "../src/core/types.js";
import { tempDirectory } from "./helpers.js";

const profiles: CompiledProfile[] = [{
  id: "senior",
  displayName: "Senior",
  category: "practical",
  summary: "Terse",
  surpriseEligible: false,
  cards: { 1: "senior one", 2: "senior two", 3: "senior three" },
}];

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

test("OpenCode registers /mouthfeel and keeps activation prospective", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-opencode-");
  const hooks = await plugin(root);
  const config = {} as Config;
  assert.ok(hooks.config);
  await hooks.config(config);
  assert.ok(config.command?.mouthfeel);

  await command(hooks, "s", "senior 2");
  const control = await transform(hooks, "s");
  assert.match(control.join("\n"), /control turn/i);
  assert.doesNotMatch(control.join("\n"), /senior two/);

  await message(hooks, "s", "Diagnose it");
  assert.match((await transform(hooks, "s")).join("\n"), /senior two/);
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
