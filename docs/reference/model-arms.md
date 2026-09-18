# How each model arm carries a profile

Per-arm behavior observed across host-smoke sweeps. These are properties of the models, not
of any one profile, and they decide which arm a given profile can be shipped on.

Raw evidence, with sample counts and per-profile verdicts, is in `evals/findings/`. That
material predates the two-level rescale and scores three profiles that no longer exist;
the conclusions below are the parts that survived it.

## opus — the reference arm

Clean on every profile at every intensity in both sweeps: 18/18 with correct progression on
2026-09-04, and zero constraint violations on 2026-09-18. It holds additive and subtractive
instructions simultaneously, and does so in long replies rather than by saying less — its
`po` replies on 2026-09-18 ran 600–664 words against sonnet's 272–316 while leaking nothing.

Judge new profile wording here first. A failure on opus is a prompt problem; a failure only
on sonnet is the arm.

## sonnet — holds the voice, drops the restraint

Sonnet reliably adopts what a profile tells it to *do* and unreliably obeys what a profile
tells it *not* to do. Two independent observations of the same failure:

- **2026-09-04** — intensity 1 over-projected on 9 of 18 profiles, reading like intensity 2.
  Eight were fixed by making the shared card's distribution sentence intensity-aware and
  adding one restraint line per affected profile.
- **2026-09-18** — `po` names implementation mechanisms (`localhost`, `HTTP`, `SwiftUI`,
  `UserDefaults`) at *both* intensities on the long-form case, against a profile rule that
  forbids them at every intensity. Opus named none of them on the same case.

The two observations involve different profiles, different rules and different scales, which
is what makes this an arm property rather than a wording bug. Profiles whose character is
subtractive — `po`, and any profile whose value is in what it omits — are unreliable on
sonnet and safe on opus. Profiles that are purely additive are fine on both.

## codex / gpt-5.6-sol — flattens long replies

Short replies stay in voice; long ones lose it. On the long-form case the voice survives only
as a detachable clause in the opening or closing sentence, with a baseline-prose body, for
even the loudest profiles. This is the rubric's explicit distribution-fail condition.

It is model behavior, not the csd effort pin: overriding reasoning effort upward barely
moved it. See `docs/reference/agent-hosts.md` for the effort-pinning mechanics.

## Why codex ordinary turns stay quiet

Codex ships without `remindOnEveryActiveTurn`, so nothing reinforces the activation card
across a long generation and its influence decays. Enabling per-turn reminders is the
obvious fix and was tested on 2026-09-04:

- It **surfaced the reminder text into the parsed reply** in 3 of 3 samples.
- It **did not reliably fix distribution** — bodies stayed largely baseline with the
  reminder present.

Rejected on that evidence. Do not re-enable it without re-testing both halves; the leak
alone disqualifies it.

What was kept instead is the persistence block in the shared card prefix
(`renderRuntimeCard` in `src/core/profiles.ts`), following the pattern the caveman plugin
uses: the card states that the profile stays active for every future reply and applies to
entire structured replies, not only their openings and closings. That moved codex glados
from 4/4 bookend-only failures to marginal, with no leak and no regression on Claude.

The remaining lever is a session-scoped persistent instruction channel on Codex that is
re-read each turn without entering the visible transcript. Caveman achieves this with a
global `~/.codex/AGENTS.md`, which does not fit Mouthfeel's per-conversation scope as-is.
