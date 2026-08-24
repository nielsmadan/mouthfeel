import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { createPiExtension } from "../src/adapters/pi.js";
import type { CompiledProfile } from "../src/core/types.js";

const profiles: CompiledProfile[] = [{
  id: "sailor",
  displayName: "Sailor",
  category: "fun",
  summary: "Sea dog",
  surpriseEligible: true,
  cards: { 1: "one", 2: "two", 3: "three" },
}];

type Handler = (event: unknown, context: ExtensionContext) => unknown;
type Command = (args: string, context: ExtensionCommandContext) => Promise<void>;

function harness(initialEntries: unknown[] = []) {
  const commands = new Map<string, Command>();
  const handlers = new Map<string, Handler>();
  const entries = initialEntries;
  const notices: string[] = [];
  const userMessages: string[] = [];
  let visibleEntries = entries;
  const pi = {
    registerCommand(name: string, options: { handler: Command }) {
      commands.set(name, options.handler);
    },
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    appendEntry(customType: string, data: unknown) {
      entries.push({ type: "custom", customType, data });
    },
    sendUserMessage(content: string) {
      userMessages.push(content);
    },
  } as unknown as ExtensionAPI;
  const context = {
    ui: { notify: (message: string) => notices.push(message) },
    sessionManager: { getEntries: () => visibleEntries },
  } as unknown as ExtensionCommandContext;
  createPiExtension(profiles)(pi);
  return {
    commands,
    context,
    entries,
    handlers,
    notices,
    setVisibleEntries(value: unknown[]) {
      visibleEntries = value;
    },
    userMessages,
  };
}

async function inject(candidate: ReturnType<typeof harness>, prompt: string) {
  return await candidate.handlers.get("before_agent_start")?.({ prompt, systemPrompt: "base" }, candidate.context) as
    | { systemPrompt: string }
    | undefined;
}

test("Pi registers /mouthfeel and keeps activation prospective", async () => {
  const pi = harness();
  await pi.handlers.get("session_start")?.({}, pi.context);
  await pi.commands.get("mouthfeel")?.("sailor 2", pi.context);
  assert.match(pi.notices.at(-1) ?? "", /sailor, intensity 2/i);

  const result = await inject(pi, "Explain it");
  assert.match(result?.systemPrompt ?? "", /^base\n\n/);
  assert.match(result?.systemPrompt ?? "", /two$/);
});

test("Pi restores active state after extension recreation", async () => {
  const first = harness();
  await first.commands.get("mouthfeel")?.("sailor 3", first.context);

  const restored = harness(first.entries);
  await restored.handlers.get("session_start")?.({}, restored.context);
  const result = (await inject(restored, "Continue"))?.systemPrompt ?? "";
  assert.match(result, /^base\n\n/);
  assert.match(result, /three$/);
});

test("Pi restores an off tombstone without styling later replies", async () => {
  const first = harness();
  await first.commands.get("mouthfeel")?.("sailor", first.context);
  await first.commands.get("mouthfeel")?.("off", first.context);
  assert.equal(await inject(first, "Continue"), undefined);

  const restored = harness(first.entries);
  await restored.handlers.get("session_start")?.({}, restored.context);
  assert.equal(await inject(restored, "Continue"), undefined);
});

test("Pi follows state when navigating between session-tree branches", async () => {
  const pi = harness();
  await pi.commands.get("mouthfeel")?.("sailor 1", pi.context);
  const activeBranch = [...pi.entries];

  pi.setVisibleEntries([]);
  await pi.handlers.get("session_tree")?.({}, pi.context);
  assert.equal(await inject(pi, "On the empty branch"), undefined);

  pi.setVisibleEntries(activeBranch);
  await pi.handlers.get("session_tree")?.({}, pi.context);
  const result = (await inject(pi, "Back on the active branch"))?.systemPrompt ?? "";
  assert.match(result, /^base\n\n/);
  assert.match(result, /one$/);
});

test("Pi scheduled tasks clear untranslate eligibility", async () => {
  const pi = harness();
  await pi.commands.get("mouthfeel")?.("sailor", pi.context);
  await inject(pi, "Style this reply");
  assert.equal(await inject(pi, "<scheduled-task>background</scheduled-task>"), undefined);

  await pi.commands.get("mouthfeel")?.("untranslate", pi.context);
  assert.match(pi.notices.at(-1) ?? "", /nothing to untranslate/i);
});

test("Pi untranslate injects a one-shot baseline rewrite", async () => {
  const pi = harness();
  await pi.commands.get("mouthfeel")?.("sailor", pi.context);
  await inject(pi, "Style this reply");
  await pi.commands.get("mouthfeel")?.("untranslate", pi.context);
  assert.equal(pi.userMessages.length, 1);

  const rewrite = await inject(pi, "Rewrite the previous reply without Mouthfeel.");
  assert.match(rewrite?.systemPrompt ?? "", /immediately preceding/);
  assert.doesNotMatch(rewrite?.systemPrompt ?? "", /\n\ntwo/);
});
