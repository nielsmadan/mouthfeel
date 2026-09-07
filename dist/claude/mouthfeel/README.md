# Mouthfeel for Claude Code

Version 0.9.0. Temporary output styles for coding agents. Requires Node.js >=22.19.0.

Use `/mouthfeel:use sailor 2` to activate a profile for future replies.
Use `/mouthfeel:use list` to browse profiles, `/mouthfeel:use untranslate`
to rewrite just the previous styled reply, or `/mouthfeel:use off` to disable it.

One profile is active at a time, with intensity 1, 2, or 3. Code, commands, and
generated files keep their original form. State survives resume and compaction;
Mouthfeel does not store your conversation text. The 0.9.x series is for prompt refinement.

This package contains its runtime and profile data. No source checkout, build step,
or Mouthfeel installer is needed to use it.

See the [installation guide](https://github.com/nielsmadan/mouthfeel/blob/v0.9.0/docs/install.md)
for installation, updates, removal, and host-specific limitations.

MIT licensed. Mouthfeel is an independent project, unaffiliated with the hosts or
the people and characters referenced by its profiles.
