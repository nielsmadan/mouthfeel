# Variant sweep verdicts — 2026-09-04

Gate case: structured-architecture. Arms: A = claude/sonnet-5, B = claude/opus-5,
C = codex/gpt-5.6-sol (reasoning effort pinned low by csd).

Verdict codes per (profile, intensity, arm):
- **P** pass — voice recognizable at intended intensity, distributed through the
  body, readable, nothing preserved-class altered.
- **M** marginal — recognizable but under-distributed or uneven for its intensity.
- **F** fail — reads as baseline / wrong intensity / collision.
- **X** hard fail — altered command/code/error/quote (none expected on this case;
  it has no mustPreserve artifacts — preservation is checked separately on
  command-diagnosis for modified profiles).

Progression column judges 1 < 2 < 3 ordering within the arm.

| Profile | A i1/i2/i3 | A prog | B i1/i2/i3 | B prog | C i1/i2/i3 | C prog | Action |
|---|---|---|---|---|---|---|---|
| brogrammer | P/P/P | ok | P/P/P | ok; i2≈i3 | F/M/M | flat | |
| caveman | M/P/P | weak 1→2 | P/P/P | excellent | M/M/M | flat; structural survives | |
| columbo | P/P/P | ok | P/P/P | excellent | M/M/M | flat | |
| cowboy | M/P/P | weak low end | P/P/P | excellent | F/F/F | none | |
| finnish-dev | P/P/P | ok; i2≈i3 close | P/P/P | ok | M/F/F | flat | |
| glados | M/P/P | i1 loud | P/P/P | excellent | F/M/M | flat | |
| hemingway | P/P/P | subtle by design | P/P/P | ok, subtle | F/F/F | indistinct from baseline | |
| holden-caulfield | M/P/P | i1 full voice | P/P/P | good | F/M/M | flat | |
| jane-austen | P/P/P | ok | P/P/P | excellent | F/F/F | none | |
| jesse-pinkman | M/P/P | i1 full voice | P/P/P | good | F/M/M | flat | |
| junior | M/P/P | muddled; i1 heavy | P/P/P | good | F/F/F | none | |
| mentor | M/P/P | weak low end | P/P/P | good | F/F/F | none | |
| po | P/P/P | ok | P/P/P | good | F/F/F | none | |
| russian-dev | P/P/P | weak-ish low end | P/P/P | good | M/M/M | flat; article drops | |
| sailor | M/P/P | i1 loud | P/P/P | good | F/M/M | flat | |
| senior | P/P/P | ok; i2 extra section | P/P/P | ok | F/F/F | indistinct from baseline | |
| sopranos | M/P/P | i1 loud | P/P/P | good; i1 borderline | F/F/F | none | |
| valley-girl | P/P/P | ok | P/P/P | good | F/M/M | flat | |

## Post-fix status (sonnet i1, after intensity-aware card + 3 profile prohibitions)

glados, junior, mentor, sailor, jesse-pinkman: P. cowboy, holden-caulfield,
sopranos: borderline pass. caveman: still over-primitive at i1 on sonnet
(recorded residual; clean on opus). Opus i1 regression check (caveman, glados,
sailor): all still P. Preservation spot-check (glados i1, command-diagnosis):
nothing altered.
