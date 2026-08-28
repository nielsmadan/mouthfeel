import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

interface TestHost extends EventEmitter {
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
  exitCode?: number;
}

function host(output: { stdout: string[]; stderr: string[] }): TestHost {
  const value = new EventEmitter() as TestHost;
  value.stdout = { write: (text) => { output.stdout.push(text); } };
  value.stderr = { write: (text) => { output.stderr.push(text); } };
  return value;
}

test("development CLI lifecycle reports success and removes signal handlers", async () => {
  const common = await import("../scripts/dev-common.js") as typeof import("../scripts/dev-common.js") & {
    runDevelopmentCli?: <T>(
      install: (signal: AbortSignal) => Promise<T>,
      success: (result: T) => string,
      host: TestHost,
    ) => Promise<void>;
  };
  assert.ok(common.runDevelopmentCli);
  const output = { stdout: [] as string[], stderr: [] as string[] };
  const processHost = host(output);

  await common.runDevelopmentCli(async () => "0.1.0", (version) => `Installed ${version}.`, processHost);

  assert.deepEqual(output.stdout, ["Installed 0.1.0.\n"]);
  assert.deepEqual(output.stderr, []);
  assert.equal(processHost.listenerCount("SIGINT"), 0);
  assert.equal(processHost.listenerCount("SIGTERM"), 0);
});

test("development CLI lifecycle maps termination to exit code 143", async () => {
  const common = await import("../scripts/dev-common.js") as typeof import("../scripts/dev-common.js") & {
    runDevelopmentCli?: <T>(
      install: (signal: AbortSignal) => Promise<T>,
      success: (result: T) => string,
      host: TestHost,
    ) => Promise<void>;
  };
  assert.ok(common.runDevelopmentCli);
  const output = { stdout: [] as string[], stderr: [] as string[] };
  const processHost = host(output);
  const running = common.runDevelopmentCli(
    (signal) => new Promise((_fulfill, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    () => "unreachable",
    processHost,
  );

  processHost.emit("SIGTERM");
  await running;

  assert.equal(processHost.exitCode, 143);
  assert.equal(output.stdout.length, 0);
  assert.match(output.stderr.join(""), /abort/i);
});
