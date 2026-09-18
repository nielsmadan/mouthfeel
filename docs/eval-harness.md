# The eval harness

`harness/` drives real interactive agent sessions against the freshly built plugin and files
judgeable artifacts under `evals/runs/`. It automates collection only — judging stays with
the human rubric flow in `evals/RUBRIC.md` and the Voice Lab review page.

README covers the commands. This file covers the parts you cannot read off the code.

## Why it is shaped this way

**`harness/config.ts` is the portability seam.** Everything Mouthfeel-specific — dist paths,
activation and status command templates, timeouts, artifact roots — lives there, so
extracting the harness into a standalone package is close to a copy plus a new config
module. Keep new Mouthfeel specifics in `config.ts` rather than scattering them.

The original design (2026-09-04) required `harness/` to import nothing from `src/`. The
two-level rescale deliberately traded that away: `harness/types.ts`, `harness/lib.ts` and
`harness/review-page.ts` now import `Intensity`/`INTENSITIES`/`isIntensity` from
`src/core/types.ts`, so the intensity scale has one definition instead of two that can
drift. That was the right trade — a duplicated scale is how off-by-one rescale bugs get in —
but it means extraction now also needs those three symbols vendored. Do not widen the
coupling further without the same justification.

**`harness/driver.ts` is the only module that knows csd exists.** Everything else talks to
the driver interface, so replacing or upgrading the session driver touches one file.

**Live sessions never run in `npm test` or CI.** Turns cost real money and need operator
credentials. The pure logic in `harness/lib.ts` is unit-tested, `--dry-run` is the wiring
check, and a live run is an operator-invoked acceptance test.

## Operating rules

- **Run arms sequentially, not concurrently.** Parallel arms collide on worker names and
  race `npm run build` over the shared `dist/`. Sequential costs wall time only.
- **Judge the previous arm while the next runs.** That is the intended pipeline; it is why
  sequential execution is not the bottleneck it looks like.
- **A sweep is a deliberate spend.** The 2026-09-04 three-arm sweep — 18 profiles ×
  3 intensities × 3 arms, 163 sessions — cost roughly $20–50 and 5–7 hours. Scale from
  there; the run header prints the job count before launching.
- **Model choice is part of what is under test.** Unset means the host default; never
  silently downgrade an arm to save money.

## Gotchas

- **A verbatim example in a card can come back verbatim in the output.** On 2026-09-07 an
  opus reply quoted the brogrammer card's own "octopus on speed" simile. If a quoted example
  starts recurring in replies, replace it with a description of the *type* of example wanted.
- **Worker replies can notice their own environment.** Treat meta-narration about the
  workspace, or skill instructions bleeding in from the worker's own setup, as a harness
  artifact to discount rather than as profile behavior. See
  `docs/reference/agent-hosts.md`.
- **A silent staging failure looks exactly like a real result.** The codex effort rewrite
  carries a `grep` guard that exits 71 precisely because its first version failed quietly
  and produced a full sweep at the wrong setting.

## Open follow-ups

Carried over from the 2026-09-04 design and the sweep ledger; none are scheduled.

- **tmux settings are not restored.** Running pi jobs sets `extended-keys on` and
  `extended-keys-format csi-u` globally and leaves them set. Pi is out of the current
  matrix, so this is latent.
- **The review page loads CDN scripts without subresource integrity.** Raised in a review
  appendix and still open.
- **No OpenCode or Antigravity adapters.** csd covers Claude, Codex and Pi behind one
  command surface; the other two hosts need a hand-rolled driver or an upstream
  contribution.
- **No automated scoring.** Output is organised for human judging against the rubric.
- **No resume or compaction scenarios.** csd's `adopt` is Claude-only, which would make
  these feasible for that host.
- **No CI integration**, for the credential and cost reasons above.
