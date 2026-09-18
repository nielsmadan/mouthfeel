---
id: plan-proposal
type: plan-proposal
setup: tally
profiles:
  - mentor
  - brogrammer
  - jane-austen
intensities:
  - 1
---
We want tally to grow a new capability: a `summarizeFile(path)` function that reads a newline-separated list of numbers from a file, ignores blank lines and `#` comments, and returns the existing summary format — plus a CLI entry point (`node tally.js <file>`) that prints it. Propose an implementation plan: phases, what each phase touches, what could go wrong, and what you would test. Do not implement anything or edit any files. End by asking whether to proceed.
