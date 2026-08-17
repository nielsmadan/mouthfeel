import assert from "node:assert/strict";
import { mkdir, readFile, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { SidecarStore } from "../src/core/storage.js";
import type { MouthfeelSessionState } from "../src/core/types.js";
import { tempDirectory } from "./helpers.js";

const state: MouthfeelSessionState = {
  version: 1,
  profileId: "sailor",
  intensity: 2,
  lastReplyStyled: false,
  updatedAt: "2026-02-01T00:00:00.000Z",
};

test("round-trips per-session state without exposing the session id as a path", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-store-");
  const store = new SidecarStore(root);
  await store.write("../session/one", state);
  assert.deepEqual(await store.read("../session/one"), state);
  assert.equal(store.pathFor("../session/one").startsWith(root), true);
  assert.doesNotMatch(store.pathFor("../session/one"), /session\/one/);
});

test("rejects malformed, oversized, and symlink state", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-store-");
  const store = new SidecarStore(root);
  await store.ensureRoot();

  await writeFile(store.pathFor("bad"), "not json", { mode: 0o600 });
  assert.equal(await store.read("bad"), null);

  await writeFile(store.pathFor("large"), "x".repeat(9000), { mode: 0o600 });
  assert.equal(await store.read("large"), null);

  const target = join(root, "target.json");
  await writeFile(target, JSON.stringify(state), { mode: 0o600 });
  await symlink(target, store.pathFor("link"));
  assert.equal(await store.read("link"), null);
});

test("rejects symlink and non-directory write boundaries", async (context) => {
  const parent = await tempDirectory(context, "mouthfeel-store-boundary-");
  const targetRoot = join(parent, "target-root");
  await mkdir(targetRoot);
  const linkedRoot = join(parent, "linked-root");
  await symlink(targetRoot, linkedRoot);
  await assert.rejects(new SidecarStore(linkedRoot).ensureRoot(), /real directory/i);

  const fileRoot = join(parent, "file-root");
  await writeFile(fileRoot, "not a directory");
  await assert.rejects(new SidecarStore(fileRoot).ensureRoot());

  const store = new SidecarStore(targetRoot);
  const target = join(parent, "target.json");
  await writeFile(target, JSON.stringify(state));
  await symlink(target, store.pathFor("linked-state"));
  await assert.rejects(store.write("linked-state", state), /regular file/i);
});

test("creates user-only state directories and files", async (context) => {
  const parent = await tempDirectory(context, "mouthfeel-store-mode-");
  const root = join(parent, "state");
  const store = new SidecarStore(root);
  await store.write("session", state);
  assert.equal((await stat(root)).mode & 0o777, 0o700);
  assert.equal((await stat(store.pathFor("session"))).mode & 0o777, 0o600);
});

test("prunes sidecars older than ninety days", async (context) => {
  const root = await tempDirectory(context, "mouthfeel-store-");
  const store = new SidecarStore(root);
  await store.write("old", state);
  await store.write("fresh", state);
  const old = new Date("2025-01-01T00:00:00.000Z");
  await utimes(store.pathFor("old"), old, old);

  const count = await store.prune(new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(count, 1);
  await assert.rejects(readFile(store.pathFor("old")));
  assert.deepEqual(await store.read("fresh"), state);
});
