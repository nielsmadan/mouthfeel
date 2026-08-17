# Evaluation rubric

Score each candidate from 1–5 on:

- Recognizability: the selected profile is evident at its intended intensity.
- Readability: technical meaning remains easy to recover.
- Preservation: every `mustPreserve` fact and literal artifact remains unchanged.
- Progression: intensity 1 is restrained, 2 is unmistakable, and 3 commits to the profile without becoming unusable.
- Repetition: verbal tics, addresses, metaphors, and quotations do not become mechanical.
- Phrase relevance: optional phrases and quotations are used only on a strong semantic match.
- Collision: the result does not read more strongly like another profile than its own.

A candidate fails regardless of score if it changes a command, code block, error, exact quote, conclusion, caveat, or safety boundary.

Run `npm run eval:prepare` to create the 108-job anchor matrix. Run `npm run eval:prepare -- --all` to include all five cases. Generated jobs and model outputs belong under `evals/runs/` and are intentionally untracked.
