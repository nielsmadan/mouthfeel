# Driving agent hosts headlessly

What Claude Code and csd (the `claude-session-driver` skill the harness shells out to)
actually do when the eval harness drives them, as opposed to what their docs imply. Each
finding cost an experiment here; without this file the next person re-establishes it from
scratch.

Probed against **Claude Code 2.1.277** and **csd 4.0.0** on the dates given.

## Folder trust is keyed on the git root

*(probed 2026-09-18)*

Claude Code asks "Is this a project you created or one you trust?" for any project root it
has not seen before, and the answer is stored per path in `~/.claude.json` under
`projects["<path>"].hasTrustDialogAccepted`.

Three properties matter for the harness, and two of them are counter-intuitive:

- **The key is the git root, not the working directory.** A subdirectory of an
  already-trusted repo inherits its trust and launches with no prompt. Running `git init`
  inside that subdirectory makes it a root in its own right and severs the inheritance, so
  it prompts.
- **Bypass-permissions does not suppress it.** A worker showing `⏵⏵ bypass permissions on`
  still blocks on the trust dialog. Tool permissions and workspace trust are separate gates.
- **There is no flag or settings key that disables it.** `--dangerously-skip-permissions`
  does not cover it. The only documented escape is non-interactive mode — `-p`, or stdout
  not being a TTY — which is unavailable to us because csd drives interactive tmux panes
  through multi-turn conversations.

This is why job workspaces are subdirectories of one persistent sandbox repo
(`sandboxRoot` in `harness/config.ts`, created by `ensureSandboxRepo` in `harness/run.ts`)
rather than roots of their own. The alternative — a fresh `git init` per job — costs one
unanswerable dialog per job. The sandbox root still isolates a worker's git commands from
the enclosing checkout, which was the reason the per-job repo existed.

The sandbox root must be trusted once, interactively, by a human. Trust survives deleting
and recreating the directory, because the record lives outside the repo.

**Do not give job workspaces their own repo again.** This was tried on 2026-09-08 to
suppress a cosmetic leak — a worker noticed it was inside a gitignored directory and said
"git status here comes back empty" — and it silently broke every launch, because it
violates the git-root rule above. The leak is harmless; the breakage is total, and it
surfaces only as an unexplained 30-second timeout.

## Workers need auth shims and an unsandboxed tmux server

Two machine-level preconditions, both verified 2026-09-04 and still load-bearing:

- **Bare CLI binaries have no login state.** Credentials come from the user's sops zsh
  wrappers, so workers launch through generated shims (`CSD_CLAUDE_BIN`, `CSD_CODEX_BIN`,
  `CSD_PI_BIN`) — small zsh scripts that source `~/.zshrc` and exec the wrapped command.
- **The tmux server must not be sandboxed.** Workers spawn as children of the tmux server;
  a server first started from inside a sandboxed agent session inherits that sandbox and
  loses credential access. Run sweeps from a normal shell. Preflight checks that a server
  is reachable before any job launches.

## csd cannot answer interactive dialogs

Any prompt that stops the TUI stops the worker. csd reports only
`Worker session failed to start within 30 seconds` with no indication that a dialog is on
screen, so the failure looks like a hang or a slow boot. When a launch times out, capture
the pane before the session is torn down — the harness's own `writeDiagnostics` cannot,
because a failed launch returns no worker handle.

## csd pins codex reasoning effort, and env vars do not reach workers

csd writes `model_reasoning_effort = "low"` into the staged codex `config.toml`, and
forwards only `CSD_*` variables into the worker's tmux session. Setting
`CODEX_REASONING_EFFORT` or similar in the harness process has no effect.

The harness therefore bakes a `sed` rewrite of that file into the generated shim, guarded
by a `grep` that exits 71 if the rewrite did not land — see `codexInstallPreExec` in
`harness/hosts/codex.ts`. The guard matters: the first attempt at this failed silently and
produced a whole sweep at the wrong effort, which is indistinguishable from a real result.

## Known flakes and leaks

- **Paste confirmation (csd issue #20).** Occasionally a prompt is pasted but submission is
  never confirmed, failing the job with
  `prompt pasted but worker did not confirm submission within 120s`. Raising
  `CSD_SUBMIT_TIMEOUT` clears it. Observed once in 42 jobs on 2026-09-18; the re-run passed
  unchanged, so treat it as timing, not as a result.
- **Worker environment bleeds into replies.** Roughly 6 of 54 codex replies on 2026-09-04
  opened with "using the superpowers workflow" meta-narration inherited from the worker's
  own environment rather than from the case. Harness isolation is imperfect; discount such
  openings when judging a reply rather than scoring them as profile behavior.
