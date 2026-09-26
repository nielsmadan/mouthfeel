# Mouthfeel
A locally developed plugin that switches a coding-agent conversation into a chosen output style (a practical mode such as `senior`, or a theatrical one such as `sailor`), with native packages for Claude Code, Codex, Pi, OpenCode, and Antigravity.

## Commands
| Command | Description |
|---------|-------------|
| `npm run setup` | `npm ci`, install Git hooks, then run doctor. |
| `npm run doctor` | Validate that dependencies and Git hooks are installed. |
| `npm run check` | Release-tool tests, `tsc --noEmit`, then build and run the test suite. |
| `npm run dev:claude` | Rebuild and reinstall the Claude plugin under a cache-busted version. |
| `npm run dev:codex` | Same, for Codex. |
| `npm run dev:pi` | Same, for Pi. |
| `npm run dev:oc` | Same, for OpenCode. |
| `npm run release` | Run `scripts/release.py` to prepare and publish a release. |

## Gotchas
- `dist/` is generated from `profiles/`, `src/core/`, `src/adapters/`, and `src/runtime/`. Edit the sources, never the packages under `dist/`.
- `npm run dev:claude` stamps a fresh `+claude.local-<timestamp>-<uuid>` version into the generated manifest, updates and enables the plugin, then restores the canonical manifest. That version stamp is what stops Claude serving a cached copy; run `/reload-plugins` or start a new session to load it.
- `npm test` builds first via `pretest`, so tests always run against freshly generated packages.
- Local development needs Python 3.9+ in addition to Node/npm.
