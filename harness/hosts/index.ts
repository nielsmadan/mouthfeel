import type { HostAdapter, HostId } from "../types.js";
import { claudeHost } from "./claude.js";
import { codexHost } from "./codex.js";
import { piHost } from "./pi.js";

export const hostAdapters: Record<HostId, HostAdapter> = {
  claude: claudeHost,
  codex: codexHost,
  pi: piHost,
};
