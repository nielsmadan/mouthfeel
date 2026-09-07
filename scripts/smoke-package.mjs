import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [host, directory, state] = process.argv.slice(2);
assert.ok(host && directory && state, "Expected host, extracted package, and isolated state directory");
await mkdir(state, { recursive: true });

function assertCard(text) {
  assert.match(text, /# Mouthfeel: Sailor \(intensity 2\)/);
}

async function hook(input) {
  const event = host === "antigravity" ? "PreInvocation" : input.hook_event_name;
  const label = `${host} ${event}`;
  const config = JSON.parse(await readFile(join(directory,
    host === "antigravity" ? "hooks.json" : "hooks/hooks.json"), "utf8"));
  let hooks;
  if (host === "antigravity") {
    hooks = config.mouthfeel[event];
  } else {
    const groups = config.hooks[event];
    assert.equal(groups.length, 1, `${label}: expected one hook group`);
    if (event === "SessionStart") {
      assert.equal(typeof groups[0].matcher, "string", `${label}: missing matcher`);
      assert.match(input.source, new RegExp(`^(?:${groups[0].matcher})$`), `${label}: source does not match`);
    }
    hooks = groups[0].hooks;
  }
  assert.equal(hooks.length, 1, `${label}: expected one command hook`);
  const definition = hooks[0];
  assert.equal(definition.type, "command", `${label}: expected a command hook`);
  assert.equal(typeof definition.command, "string", `${label}: missing command`);
  assert.ok(Number.isFinite(definition.timeout) && definition.timeout > 0, `${label}: invalid timeout`);
  const result = spawnSync(definition.command, {
    shell: true,
    cwd: host === "antigravity" ? directory : process.cwd(),
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: Math.min(definition.timeout * 1000, 10_000),
    env: process.env,
  });
  assert.equal(result.error, undefined, `${label}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.equal(result.stderr, "", `${label}: ${result.stderr}`);
  assert.ok(result.stdout.trim(), `${label}: hook returned no JSON`);
  return JSON.parse(result.stdout);
}

if (host === "claude" || host === "codex") {
  const selected = await hook({
    session_id: "release-smoke",
    hook_event_name: "UserPromptSubmit",
    prompt: host === "claude" ? "/mouthfeel:use sailor 2" : "$mouthfeel:use sailor 2",
  });
  assertCard(selected.hookSpecificOutput.additionalContext);
  const restored = await hook({ session_id: "release-smoke", hook_event_name: "SessionStart", source: "resume" });
  assertCard(restored.hookSpecificOutput.additionalContext);
} else if (host === "antigravity") {
  const transcriptPath = join(state, "transcript.jsonl");
  const input = { conversationId: "release-smoke", transcriptPath, artifactDirectoryPath: state, invocationNum: 0 };
  await writeFile(transcriptPath, `${JSON.stringify({ role: "user", content: "/mouthfeel sailor 2" })}\n`);
  const selected = await hook(input);
  assert.match(selected.injectSteps[0].ephemeralMessage, /Mouthfeel: sailor, intensity 2/);
  await writeFile(transcriptPath, `${JSON.stringify({ role: "user", content: "Explain the project." })}\n`);
  assertCard((await hook(input)).injectSteps[0].ephemeralMessage);
} else if (host === "pi") {
  const extension = (await import(pathToFileURL(join(directory, "index.js")).href)).default;
  assert.equal(typeof extension, "function");
  const entries = [];
  const context = { sessionManager: { getEntries: () => entries }, ui: { notify() {} } };
  const setup = () => {
    const handlers = new Map();
    let command;
    extension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand(name, definition) {
        assert.equal(name, "mouthfeel");
        command = definition.handler;
      },
      appendEntry: (customType, data) => entries.push({ type: "custom", customType, data }),
    });
    assert.equal(typeof command, "function");
    return { handlers, command };
  };
  const first = setup();
  await first.command("sailor 2", context);
  const event = { prompt: "Explain the project.", systemPrompt: "Baseline" };
  assertCard((await first.handlers.get("before_agent_start")(event)).systemPrompt);
  const resumed = setup();
  await resumed.handlers.get("session_start")({}, context);
  assertCard((await resumed.handlers.get("before_agent_start")(event)).systemPrompt);
} else if (host === "opencode") {
  const plugin = (await import(pathToFileURL(join(directory, "index.js")).href)).Mouthfeel;
  assert.equal(typeof plugin, "function");
  const first = await plugin();
  const config = {};
  await first.config(config);
  assert.equal(config.command.mouthfeel.template, "/mouthfeel $ARGUMENTS");
  await first["command.execute.before"]({ sessionID: "release-smoke", command: "mouthfeel", arguments: "sailor 2" });
  const output = { system: [] };
  await first["experimental.chat.system.transform"]({ sessionID: "release-smoke" }, output);
  assertCard(output.system.join("\n"));
  await first.dispose();
  const resumed = await plugin();
  const restored = { system: [] };
  await resumed["experimental.chat.system.transform"]({ sessionID: "release-smoke" }, restored);
  assertCard(restored.system.join("\n"));
  await resumed.dispose();
} else {
  throw new Error(`Unknown host: ${host}`);
}

console.log(`${host}: activation and restore passed`);
