# Precedents and deliberate differences

Mouthfeel reuses patterns proven by adjacent projects without copying their product model.

- [Caveman](https://github.com/juliusbrussee/caveman) demonstrated lifecycle hooks, command-envelope parsing, fail-open behavior, secure atomic state, compaction handling, and strict preservation of literal technical material.
- [Code Abyss](https://github.com/telagod/code-abyss) demonstrated canonical persona schemas, generated multi-agent installs, validation, lazy supporting material, and behavioral tests. Mouthfeel does not compose persona, style, and engineering behavior; one temporary profile replaces another.
- [Say Less](https://github.com/mooch-agency/say-less) demonstrated baseline-relative calibration, multi-turn drift testing, prompt-version comparisons, and the value of concise examples.
- [Moods](https://github.com/grassclaw/moods) and [LEJ Output Fixer](https://github.com/justfinethanku/LEJ-output-fixer) showed that Claude output styles can be distributed through plugins. Mouthfeel uses session commands and hooks so changing style does not require a new or cleared conversation.
- [OpenCode Persona Plugin](https://github.com/megastruktur/opencode-persona-plugin) demonstrated live persona switching through OpenCode’s system-prompt transform. Mouthfeel keeps state per conversation and performs no startup network access.
- Pi’s [pirate extension example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/pirate.ts) established the native registered-command plus `before_agent_start` pattern.

Mouthfeel’s distinct combination is temporary per-conversation state, one active profile, three intensities, a one-time `surprise` selection, one-shot `untranslate`, and native packages generated for five hosts from the same profile sources.
