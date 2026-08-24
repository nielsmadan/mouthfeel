---
id: structured-architecture
type: long-form-explanation
profiles:
  - sailor
intensities:
  - 2
---
Explain the following developer tool to a new contributor. Use these sections: What it is, How it works, What users get, Code shape, and Where to read next. Keep the explanation technically precise and do not edit files.

Juggler is a native macOS menu-bar companion for people running several coding-agent sessions. Claude Code, OpenCode, Codex, and Pi send lifecycle events to a localhost HTTP server. A session manager tracks idle, permission, working, compacting, and backburner states. Idle and permission-waiting sessions enter a cycling queue. Global hotkeys select a session, and terminal bridges activate the correct iTerm2 or Kitty tab or pane. Users also get notifications, terminal highlighting, a monitor window, queue-ordering modes, a selection HUD called the beacon, and working and idle statistics. The SwiftUI project is divided into Models, Managers, Services, Views, and Resources. Juggler does not run agents, replace the terminal, or manage worktrees. Sessions remain in memory; preferences use `UserDefaults`. Recommend the technical overview, feature overview, and session-management guide for further reading.
