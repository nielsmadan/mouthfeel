import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import type { Intensity, MouthfeelSessionState } from "./types.js";

const MAX_STATE_BYTES = 8192;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function isIntensity(value: unknown): value is Intensity {
  return value === 1 || value === 2 || value === 3;
}

export function isSessionState(value: unknown): value is MouthfeelSessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.updatedAt !== "string" || Number.isNaN(Date.parse(candidate.updatedAt))) {
    return false;
  }
  if (candidate.mode === "off") {
    return candidate.lastReplyStyled === false
      && candidate.profileId === undefined
      && candidate.intensity === undefined;
  }
  return candidate.version === 1
    && (candidate.mode === undefined || candidate.mode === "active")
    && typeof candidate.profileId === "string"
    && candidate.profileId.length <= 64
    && isIntensity(candidate.intensity)
    && typeof candidate.lastReplyStyled === "boolean"
    && typeof candidate.updatedAt === "string";
}

export class SidecarStore {
  constructor(private readonly root: string) {}

  pathFor(sessionId: string): string {
    const name = createHash("sha256").update(sessionId).digest("hex");
    return join(this.root, `${name}.json`);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("state root must be a real directory");
    await chmod(this.root, 0o700).catch(() => undefined);
  }

  async read(sessionId: string): Promise<MouthfeelSessionState | null> {
    try {
      const path = this.pathFor(sessionId);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_STATE_BYTES) return null;
      const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
      const handle = await open(path, constants.O_RDONLY | noFollow);
      try {
        const raw = await handle.readFile({ encoding: "utf8" });
        const parsed: unknown = JSON.parse(raw);
        return isSessionState(parsed) ? parsed : null;
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  async write(sessionId: string, state: MouthfeelSessionState): Promise<void> {
    if (!isSessionState(state)) throw new Error("invalid Mouthfeel session state");
    await this.ensureRoot();
    const path = this.pathFor(sessionId);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) throw new Error("state target must be a regular file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const raw = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(raw) > MAX_STATE_BYTES) throw new Error("state exceeds size cap");
    const temporary = join(this.root, `.${createHash("sha256").update(`${sessionId}:${process.pid}:${Date.now()}`).digest("hex")}.tmp`);
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    try {
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
      try {
        await handle.writeFile(raw, { encoding: "utf8" });
        await handle.chmod(0o600).catch(() => undefined);
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async delete(sessionId: string): Promise<void> {
    const path = this.pathFor(sessionId);
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) return;
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async prune(now = new Date()): Promise<number> {
    await this.ensureRoot();
    let removed = 0;
    for (const name of await readdir(this.root)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const path = join(this.root, name);
      const info = await lstat(path).catch(() => null);
      if (!info || info.isSymbolicLink() || !info.isFile()) continue;
      const details = await stat(path);
      if (now.getTime() - details.mtimeMs <= MAX_AGE_MS) continue;
      await unlink(path);
      removed += 1;
    }
    return removed;
  }
}
