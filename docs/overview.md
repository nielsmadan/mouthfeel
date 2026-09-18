# Docs

- [precedents.md](precedents.md) — what Mouthfeel reuses from adjacent projects and what it
  deliberately does differently.
- [eval-harness.md](eval-harness.md) — why `harness/` is shaped the way it is, how to run a
  sweep without wasting one, and the open follow-ups.
- [reference/agent-hosts.md](reference/agent-hosts.md) — how Claude Code and csd behave when
  driven headlessly. Read before changing anything about how workers launch.
- [reference/model-arms.md](reference/model-arms.md) — what each model arm does to a profile,
  and which arms a given profile can be trusted on.

Commands, install steps and the profile roster live in the root
[README](../README.md). Scoring criteria live in [evals/RUBRIC.md](../evals/RUBRIC.md);
raw sweep evidence in `evals/findings/`.
