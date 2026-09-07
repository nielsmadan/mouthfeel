# Releasing Mouthfeel

The first release is `0.9.0`. Use `0.9.x` patch releases while refining profile
prompts. Every shipped prompt change needs a new version: hosts cache plugins,
and published npm versions cannot be replaced. Development installers use
temporary cache-busted versions without changing the release version.

## Prepare locally

Requires Node.js 22.19 or newer, npm, Python 3.9+, and `tar`. Release preparation is exercised
locally on macOS and by CI on Linux; it does not require installed agent CLIs,
model credentials, or npm publishing credentials.

```sh
npm ci
npm run release:prepare -- --tag v0.9.0
```

The tag argument checks the intended tag; it does not create it. Omitting it
prepares the version in `package.json`. Release versions are plain
`major.minor.patch`, without development suffixes.

Preparation checks the root package and lockfile versions, runs typechecking,
builds all adapters, and runs the test suite. It then:

1. Copies the completed build to an isolated temporary directory.
2. Checks manifest versions, entrypoints, required files, and npm file allowlists.
3. Uses `npm pack --ignore-scripts` for Pi and OpenCode and creates host archives.
4. Extracts every archive outside the checkout and compares its files with the build.
5. Exercises activation and state restoration using the packaged hook commands
   and minimal host-API stand-ins, with isolated state and no development dependencies.
   Hook checks use host-specific environment variables and extracted paths with
   spaces to catch command-wiring and quoting errors.
6. Builds a combined Claude/Codex marketplace with both catalogs at its root,
   validates its source paths, and archives it.
7. Writes SHA-256 checksums and a release inventory.

These are packaging checks, not model-output evaluations or real-host acceptance
tests. Continue prompt evaluation and interactive host smoke tests separately.

Output goes to the ignored `release/v0.9.0/` directory:

```text
release.json
marketplace/
  .claude-plugin/marketplace.json
  .agents/plugins/marketplace.json
  claude/mouthfeel/
  plugins/mouthfeel/
artifacts/
  mouthfeel-claude-0.9.0.tgz
  mouthfeel-codex-0.9.0.tgz
  mouthfeel-antigravity-0.9.0.tgz
  mouthfeel-marketplace-0.9.0.tgz
  nielsmadan-mouthfeel-pi-0.9.0.tgz
  nielsmadan-opencode-mouthfeel-0.9.0.tgz
  SHA256SUMS
```

Rerunning replaces the previous generated output only after validation succeeds.
A failed preparation preserves the previous completed release. Checksums describe
the exact files produced by that run; archive timestamps can differ between runs.
The command does not install plugins, commit, tag, push, or publish anything.

## Tag and create a draft release

From a clean, current `main` checkout, `npm run release` proposes the first version
as `0.9.0`, runs the checks, and asks for confirmation. After confirmation it
updates versions, rebuilds and tests `dist`, commits those changes, and pushes
`main` and an annotated tag atomically. It prints workflow and draft-release links
and finishes; GitHub creates the draft asynchronously. This requires complete Git
history and tags plus Git push access, but not the `gh` CLI. Local success confirms
the push, not publication. Check the linked workflow, then inspect and publish the
draft manually.

For later prompt refinements, use `npm run release -- patch`. Use
`npm run release -- --dry-run` to preview without running checks or changing Git
or release state. `--yes` explicitly confirms unattended execution.

To manage the version, commit, and tag manually instead:

1. Update `package.json` and both root version fields in `package-lock.json`.
   `npm version 0.9.1 --no-git-tag-version` can do this for the next patch release.
2. Run release preparation with the intended tag and inspect the artifacts.
3. Review and commit the source changes and regenerated `dist` files. Tag the
   committed release, never the older HEAD while release changes are uncommitted.
4. Create and push the tag yourself:

   ```sh
   git tag -a v0.9.0 -m "Mouthfeel 0.9.0"
   git push origin main
   git push origin v0.9.0
   ```

5. The tag workflow repeats release preparation, rejects a tag/version mismatch,
   and uploads the six archives, checksums, and inventory to a **draft** GitHub
   release. It does not publish to npm or update a marketplace branch.
6. Inspect the draft, download its artifacts, verify checksums, and smoke-test
   the installation paths in [the installation guide](install.md). Publish the
   draft when ready. Treat published release artifacts as immutable.

Do not run the tag workflow again after making a release public: it can replace
assets and their checksums. Cut a new patch release for changed content.

## Remaining distribution setup

The local packaging path and draft-release workflow are implemented. Before
advertising direct registry installs or removing tracked `dist`, finish:

- Bootstrap the two scoped npm packages, `@nielsmadan/mouthfeel-pi` and
  `@nielsmadan/opencode-mouthfeel`, using the prepared npm tarballs. Configure
  package-specific GitHub trusted publishing and add a publishing job that can
  resume safely after one of the two packages has already published.
- Publish the generated `marketplace/` tree to a CI-managed distribution branch.
  Its root must contain both catalogs; publishing the existing `dist/` layout
  unchanged would leave the catalogs nested too deeply for Git discovery.
- Document the actual registry and Git-marketplace install/update commands once
  those endpoints exist and have passed installation tests.
- Remove tracked `dist` and replace the CI drift check after those distribution
  paths work. Keep the local build and `dev:*` commands.

The private root npm package is build tooling. Only the two generated adapter
packages are intended for npm publication. No Mouthfeel installer CLI is needed.
