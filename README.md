# Mouthfeel

Temporary output styles for coding agents.

Mouthfeel lets you switch one conversation into a practical communication mode such as `senior` or `mentor`, or a more theatrical voice such as `sailor`, `glados`, or `jane-austen`. The selection survives resume and compaction, affects only direct chat prose, and stays out of code, commands, generated files, quotes, errors, tool output, and unattended work.

It ships native packages for Claude Code, Codex, Pi, OpenCode, and Antigravity. There is no Mouthfeel installer CLI.

## Commands

Claude uses `/mouthfeel:use`, Codex uses `$mouthfeel:use`, and Pi, OpenCode, and Antigravity use `/mouthfeel`.

```text
<profile> [1|2|3]    activate for future replies; default intensity is 2
surprise [1|2|3]     select one random fun profile and keep it active
intensity <1|2|3>    change the active intensity
status               show the active profile
list                 list profiles
untranslate          rewrite only the previous styled reply in the host baseline
off                  disable Mouthfeel
```

Only one profile can be active. V1 does not support stacking or per-turn shuffle.

## Roster

| Profile | What it changes |
|---|---|
| `junior` | Makes hidden premises, causal links, definitions, and concrete examples explicit. |
| `senior` | Compresses aggressively relative to the host baseline and assumes technical fluency. |
| `po` | Explains user-visible behavior, impact, and tradeoffs without requiring implementation knowledge. |
| `mentor` | Builds one useful mental model and extracts a reusable lesson or learning trail. |
| `valley-girl` | Animated conversational rhythm, evaluative asides, and socially framed transitions. |
| `caveman` | Primitive grammar and compressed declarative reasoning without losing technical facts. |
| `sailor` | A wizened sailor instructing a green crewmate with affectionate exasperation. |
| `brogrammer` | Capable, frat-adjacent swagger that treats good engineering as competitive status. |
| `cowboy` | Measured Western cadence, short statements, and practical frontier judgment. |
| `finnish-dev` | Fluent Finnish-influenced developer English, calques, understatement, and rare article omission. |
| `russian-dev` | Capable Russian-influenced developer English, direct conclusions, and literal constructions. |
| `hemingway` | Concrete verbs, plain words, restrained confidence, and short declarative prose. |
| `jane-austen` | Balanced clauses, social observation, and dry judgments about software behavior. |
| `holden-caulfield` | Digressive skepticism, plainspoken judgment, and resistance to phony ceremony. |
| `glados` | Clinical precision, test language, and controlled condescension. |
| `sopranos` | Plainspoken ensemble grievance, crew dynamics, and at most one semantically apt short reference. |
| `jesse-pinkman` | Rough, reactive cadence with a perceptive explanation underneath it. |
| `columbo` | Polite self-effacement that circles back to the one detail that does not fit. |

## Examples

With `senior 2`:

> `ls` serially reconciles every project against its Markdown or SQLite source before querying the shared index. Because the index is derived state, unchanged `--all-projects` runs still scale with project count and source size.
>
> Add per-project freshness fingerprints to skip reconciliation. Reusing one index connection is a secondary optimization.

With `sailor 2`:

> Right, deckhand, pay attention. `cadet ls --all-projects` is in. It gathers active tasks from every project and groups them properly, because apparently checking projects one at a time was becoming an expedition.
>
> Need completed and terminal tasks too? Add the second `--all`. Yes, the two flags mean different things. Try to contain your surprise.

The full approved examples live in [`evals/references/approved-intensity-2.md`](evals/references/approved-intensity-2.md). The evaluation corpus keeps examples and research out of runtime context.

## Build and install locally

```sh
npm ci
npm run check
```

The build writes five installable packages under `dist/`.

### Claude Code

```sh
claude plugin marketplace add ./dist/claude
claude plugin install mouthfeel@mouthfeel
```

Use `/mouthfeel:use sailor 2` in a new session.

### Codex

```sh
codex plugin marketplace add ./dist/codex
codex plugin add mouthfeel@mouthfeel
```

Use `$mouthfeel:use sailor 2` in a new thread.

### Pi

```sh
pi install ./dist/pi/mouthfeel
```

Use `/mouthfeel sailor 2`.

### OpenCode

For local development, copy `dist/opencode/mouthfeel/index.js` into `.opencode/plugins/mouthfeel.js`. Once published, add `@nielsmadan/opencode-mouthfeel` to the `plugin` array in `opencode.json`.

Use `/mouthfeel sailor 2`. This adapter uses OpenCode’s experimental system-prompt and compaction hooks, so compatibility is version-sensitive.

### Antigravity

```sh
agy plugin install ./dist/antigravity/mouthfeel
```

Use `/mouthfeel sailor 2`. The adapter restores state through a conversation sidecar and a `PreInvocation` hook. Command recognition reads Antigravity’s JSONL transcript and is therefore best-effort across transcript format changes.

## State and privacy

Mouthfeel stores only the active profile id, intensity, a last-reply flag, schema version, and timestamp. It never stores response or transcript content. Sidecars use hashed session ids, atomic writes, user-only permissions, symlink checks, an 8 KiB size cap, and 90-day pruning. Pi uses native custom session entries instead.

New conversations start with Mouthfeel off. Activating, switching, changing intensity, and `surprise` affect future replies only. `untranslate` is one-shot and leaves the active profile in place.

## Development

- Canonical profile sources: `profiles/<id>/`
- Shared controller and storage: `src/core/`
- Host adapters: `src/adapters/` and `src/runtime/`
- Generated packages: `dist/`
- Sanitized evaluation cases: `evals/cases/`

`npm run eval:prepare` produces the 108-job two-anchor matrix under the ignored `evals/runs/` directory. `npm run eval:prepare -- --all` includes all five cases. See [`evals/RUBRIC.md`](evals/RUBRIC.md).

Mouthfeel was informed by existing output-style and persona tools; [`docs/precedents.md`](docs/precedents.md) records what it reuses and deliberately changes.

## Names and affiliation

Mouthfeel is an independent project. Product, author, show, and character names identify the requested communication profile; their owners do not sponsor or endorse this project. Profiles are compact behavioral instructions, not source-text corpora, and should not be used to misrepresent generated text as the work of a named author or performer.

## License

MIT
