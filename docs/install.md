# Installing Mouthfeel

Mouthfeel `0.9.x` is the prompt-refinement series. Profiles and their intensity
may change between patch releases. Node.js 22.19 or newer is required; hook-based
hosts need `node` on their `PATH`.

Release archives contain the runtime and profiles, with no build step or source
checkout required. Until the first release is published, use the
[local development installs](../README.md#build-and-install-locally).
Direct npm and hosted Git-marketplace installation are still being prepared.

## Download and verify

After `v0.9.0` is published, download the archives and `SHA256SUMS` from
[GitHub Releases](https://github.com/nielsmadan/mouthfeel/releases). With the
GitHub CLI:

```sh
gh release download v0.9.0 --repo nielsmadan/mouthfeel --pattern '*.tgz' --pattern SHA256SUMS --dir mouthfeel-0.9.0
cd mouthfeel-0.9.0
```

Verify all downloaded archives on macOS:

```sh
shasum -a 256 -c SHA256SUMS
```

On Linux, use `sha256sum -c SHA256SUMS`. These checks detect damaged or mismatched
downloads; they are not a separate signature of the publisher.

The commands below start in that download directory. Keep extracted directories
in a persistent location: local marketplace and Pi registrations refer to them.

## Claude Code

```sh
mkdir claude
tar -xzf mouthfeel-claude-0.9.0.tgz -C claude
claude plugin marketplace add ./claude
claude plugin install mouthfeel@mouthfeel
```

Start a new session and use `/mouthfeel:use sailor 2`.

To update, replace the contents of the marketplace directory with a newer Claude archive,
run `claude plugin marketplace update mouthfeel`, then
`claude plugin update mouthfeel@mouthfeel`. Use `/reload-plugins` or start a new
session to load it.

Remove it with `claude plugin uninstall mouthfeel@mouthfeel`. If no longer needed,
remove the local catalog with `claude plugin marketplace remove mouthfeel`.

## Codex

```sh
mkdir codex
tar -xzf mouthfeel-codex-0.9.0.tgz -C codex
codex plugin marketplace add ./codex
codex plugin add mouthfeel@mouthfeel
```

Start a new thread and use `$mouthfeel:use sailor 2`.

To update, replace the contents of the marketplace directory with a newer Codex
archive, then run `codex plugin add mouthfeel@mouthfeel`. Start a new thread.
`marketplace upgrade` refreshes Git sources; this installation uses a local directory.

Remove it with `codex plugin remove mouthfeel@mouthfeel`. Remove the catalog with
`codex plugin marketplace remove mouthfeel` if no longer needed.

## Pi

```sh
mkdir pi
tar -xzf nielsmadan-mouthfeel-pi-0.9.0.tgz -C pi
pi install ./pi/package
```

Restart Pi and use `/mouthfeel sailor 2`.

To update, replace the contents of `pi/package` with the newer tarball's `package/`
directory and restart Pi.
To remove it, use `pi remove ./pi/package` from this download directory. The
`package/` prefix is npm's normal tarball layout.

## OpenCode

```sh
mkdir opencode
tar -xzf nielsmadan-opencode-mouthfeel-0.9.0.tgz -C opencode
```

Copy `opencode/package/index.js` into your OpenCode configuration's `plugins/`
directory as `mouthfeel.js`. The default is
`~/.config/opencode/plugins/mouthfeel.js`; respect `OPENCODE_CONFIG_DIR` or
`XDG_CONFIG_HOME` if configured. Restart OpenCode and use `/mouthfeel sailor 2`.

To update, replace that file with the newer extracted `index.js` and restart.
To uninstall, remove only that `mouthfeel.js` file and restart. Avoid keeping both
a local file and an npm configuration entry enabled for the same plugin.

This adapter uses experimental system-prompt and compaction hooks. Compatibility
is version-sensitive.

## Antigravity

```sh
mkdir antigravity
tar -xzf mouthfeel-antigravity-0.9.0.tgz -C antigravity
agy plugin install ./antigravity/mouthfeel
```

Start a new conversation and use `/mouthfeel sailor 2`. This adapter uses a
`PreInvocation` hook and reads the host's JSONL transcript format. Treat it as
experimental; archive-level checks do not establish compatibility with every
Antigravity version. Use the host's plugin management to update or remove it.

## Verify the integration

1. Activate `sailor 2` and ask a short question about your project.
2. Run `status` through the same Mouthfeel command; it should report sailor at 2.
3. Ask another question, then run `untranslate`. It should rewrite only the previous
   reply in ordinary language. The next substantive reply should be sailor again.
4. Run `off`, then ask another question to confirm ordinary output returns.

Resume the session to check persistence. When compaction occurs, repeat `status`.
These checks establish command and state handling; judging the quality of the
voice is a separate evaluation.

If a command is missing, check that the host enabled the plugin and reloaded it.
If activation reports that its hook did not run, check the host's hook errors and
that `node` is available. A saved-state error means activation failed; inspect the
reported path and permissions before assuming it worked.

Removing the plugin may leave its small activation-state records. Mouthfeel
stores no conversation text. See [state and privacy](../README.md#state-and-privacy)
for what is retained; do not delete an agent's session history to clear Mouthfeel.
