---
id: structured-architecture
type: long-form-explanation
anchor: false
mustPreserve:
  - Juggler does not run agents, replace the terminal, or manage worktrees
  - Claude Code, OpenCode, Codex, and Pi
  - localhost HTTP server
  - idle, permission, working, compacting, and backburner
  - iTerm2 or Kitty
  - Sessions remain in memory
  - UserDefaults
  - Models, Managers, Services, Views, and Resources
---
## What it is

Juggler is a native macOS menu-bar companion for people running several coding-agent sessions at once. It tracks which terminal sessions need attention and lets users move between them with global hotkeys.

Juggler does not run agents, replace the terminal, or manage worktrees. It coordinates sessions from Claude Code, OpenCode, Codex, and Pi while leaving the existing development tools in place.

## How it works

Agent integrations send lifecycle events to a localhost HTTP server. A session manager tracks idle, permission, working, compacting, and backburner states. Idle and permission-waiting sessions enter a cycling queue. Global hotkeys select a session, and terminal bridges activate the corresponding iTerm2 or Kitty tab or pane.

## What users get

Users get notifications, terminal highlighting, a monitor window, configurable queue-ordering modes, a selection HUD called the beacon, and working and idle statistics.

Sessions remain in memory. Preferences persist through `UserDefaults`.

## Code shape

The SwiftUI project is divided into Models, Managers, Services, Views, and Resources. Events enter through services, managers coordinate the resulting session state, models represent it, and views display it.

## Where to read next

Read the technical overview for the architecture and event flow, the feature overview for user-facing behavior, and the session-management guide for state transitions and queue behavior.
