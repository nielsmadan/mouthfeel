# Evaluation rubric

## Evaluation layers

Mouthfeel uses three kinds of evidence. None substitutes for the others:

1. **Approved references** record the human target. They show what a good result sounds like, not whether an agent will follow the profile reliably.
2. **Synthetic rewrites** apply every profile card to sanitized assistant replies under `evals/cases/`. They test preservation, progression, and broad stylistic behavior without loading a host's full instruction stack.
3. **Host smoke runs** activate the built plugin in a fresh agent session and send a direct prompt from `evals/host-cases/`. They expose instruction collisions, tool-turn dilution, and voices that appear only in an opening or sign-off.

Generated jobs and host outputs belong under `evals/runs/` and remain untracked. Promote an output to `evals/references/` only after human approval.

Score each candidate from 1–5 on:

- Recognizability: the selected profile is evident at its intended intensity.
- Readability: technical meaning remains easy to recover.
- Preservation: every `mustPreserve` fact and literal artifact remains unchanged.
- Progression: intensity 1 is restrained, 2 is unmistakable, and 3 commits to the profile without becoming unusable.
- Repetition: verbal tics, addresses, metaphors, and quotations do not become mechanical.
- Phrase relevance: optional phrases and quotations are used only on a strong semantic match.
- Collision: the result does not read more strongly like another profile than its own.

A candidate fails regardless of score if it changes a command, code block, error, exact quote, conclusion, caveat, or safety boundary.

For a long response, inspect distribution as well as recognizability. A profile does not pass intensity 2 when most sections are host-baseline prose and all recognizable markers are detachable from the opening or final paragraph. Treat imagery from a different profile's world as a collision even when the analogy is otherwise clear.

## Refinement protocol

1. Save the desired output as an approved reference.
2. Run at least five fresh prompt-level samples with no profile and five with the current profile card. Read every output; a single sample is not evidence of reliability.
3. Change one instruction group at a time and repeat the same samples. Prefer a positive output recipe for weak or uneven style; add a prohibition only after observing a repeated, specific collision.
4. Run the relevant direct prompt through the rebuilt plugin in a fresh Codex session.
5. Verify once in a second target host, currently Claude, before accepting the refinement.

The prompt-level repetitions may use a minimal host configuration to control cost. The final host checks must load the real plugin and ordinary host instructions.

Run `npm run eval:prepare` to create the 108-job anchor matrix. Run `npm run eval:prepare -- --all` to include all six synthetic cases. Generated jobs and model outputs belong under `evals/runs/` and are intentionally untracked.
