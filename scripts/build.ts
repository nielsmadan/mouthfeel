import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { loadProfiles } from "../src/core/load.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const version = (JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string }).version;
const repository = "https://github.com/nielsmadan/mouthfeel";

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function json(path: string, value: unknown): Promise<void> {
  await write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function controllerSkill(host: "Claude Code" | "Codex"): string {
  const invocation = host === "Claude Code" ? "/mouthfeel:use" : "$mouthfeel:use";
  return `---
name: use
description: Activates or controls a temporary Mouthfeel output profile when the user explicitly invokes ${invocation}.
---

# Mouthfeel controller

Only acknowledge success when the Mouthfeel lifecycle hook supplied a Mouthfeel control-turn instruction in developer context. Follow that instruction exactly and return only that response. If no Mouthfeel control-turn instruction is present, use the fallback. Respond exactly: Mouthfeel hook did not run; profile unchanged. Never infer success from this invocation alone. Activation is prospective: do not rewrite the preceding reply and do not apply the selected profile to this control response.

## Commands

- \`<profile> [1|2|3]\`: activate one profile; intensity defaults to 2
- \`surprise [1|2|3]\`: choose one eligible fun profile
- \`intensity <1|2|3>\`: change the active intensity
- \`off\`: return to the host baseline
- \`status\`: show the active profile
- \`list\`: list profiles
- \`untranslate\`: rewrite only the immediately preceding styled reply in the host baseline, then keep the profile active

## Examples

- \`${invocation} senior 1\`
- \`${invocation} sailor\`
- \`${invocation} untranslate\`

## Troubleshooting

If the hook reports an unknown profile, use \`${invocation} list\`. If state appears stale after a plugin update, start a new session so the host reloads the package.
`;
}

function hookConfig(variable: "PLUGIN_ROOT" | "CLAUDE_PLUGIN_ROOT"): object {
  return {
    hooks: {
      SessionStart: [{
        matcher: "startup|resume|clear|compact",
        hooks: [{
          type: "command",
          command: `node \"\${${variable}}/runtime/hook.mjs\"`,
          timeout: 5,
          additionalContextLimit: 2500,
        }],
      }],
      UserPromptSubmit: [{
        hooks: [{
          type: "command",
          command: `node \"\${${variable}}/runtime/hook.mjs\"`,
          timeout: 5,
          additionalContextLimit: 2500,
        }],
      }],
    },
  };
}

async function bundle(entryPoint: string, outfile: string): Promise<void> {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [join(root, entryPoint)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
  });
}

async function bundleWrapper(contents: string, outfile: string): Promise<void> {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    stdin: { contents, resolveDir: root, sourcefile: "mouthfeel-adapter.ts", loader: "ts" },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: false,
  });
}

async function main(): Promise<void> {
  const profiles = await loadProfiles(join(root, "profiles"));
  const registry = JSON.stringify(profiles);
  const license = await readFile(join(root, "LICENSE"), "utf8");
  await rm(dist, { recursive: true, force: true });

  for (const host of ["claude", "codex", "pi", "opencode", "antigravity"] as const) {
    await write(join(dist, host, "mouthfeel", "LICENSE"), license);
  }
  for (const host of ["claude", "codex", "antigravity"] as const) {
    await json(join(dist, host, "mouthfeel", "registry.json"), profiles);
  }

  const claude = join(dist, "claude", "mouthfeel");
  await json(join(dist, "claude", ".claude-plugin", "marketplace.json"), {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "mouthfeel",
    description: "Temporary output styles for coding agents",
    owner: { name: "Niels Madan", url: "https://github.com/nielsmadan" },
    plugins: [{
      name: "mouthfeel",
      description: "Temporary output styles for coding agents",
      source: "./mouthfeel",
      category: "productivity",
    }],
  });
  await json(join(claude, ".claude-plugin", "plugin.json"), {
    name: "mouthfeel",
    version,
    description: "Temporary output styles for coding agents",
    author: { name: "Niels Madan", url: "https://github.com/nielsmadan" },
    homepage: repository,
    repository,
    license: "MIT",
  });
  await json(join(claude, "hooks", "hooks.json"), hookConfig("CLAUDE_PLUGIN_ROOT"));
  await write(join(claude, "skills", "use", "SKILL.md"), controllerSkill("Claude Code"));
  await bundle("src/runtime/hook.ts", join(claude, "runtime", "hook.mjs"));

  const codex = join(dist, "codex", "mouthfeel");
  await json(join(dist, "codex", ".agents", "plugins", "marketplace.json"), {
    name: "mouthfeel",
    interface: { displayName: "Mouthfeel" },
    plugins: [{
      name: "mouthfeel",
      source: { source: "local", path: "./mouthfeel" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    }],
  });
  await json(join(codex, ".codex-plugin", "plugin.json"), {
    name: "mouthfeel",
    version,
    description: "Temporary output styles for coding agents",
    author: { name: "Niels Madan", url: "https://github.com/nielsmadan" },
    homepage: repository,
    repository,
    license: "MIT",
    keywords: ["output-style", "tone", "voice", "developer-tools"],
    skills: "./skills/",
    interface: {
      displayName: "Mouthfeel",
      shortDescription: "Temporary output styles for coding agents",
      longDescription: "Switch a coding agent's output style for the current session without changing code, commands, or generated artifacts.",
      developerName: "Niels Madan",
      category: "Developer Tools",
      capabilities: ["Hooks", "Skills"],
      websiteURL: repository,
      defaultPrompt: ["Use the senior Mouthfeel at intensity 1."],
      brandColor: "#D97757",
    },
  });
  await json(join(codex, "hooks", "hooks.json"), hookConfig("PLUGIN_ROOT"));
  await write(join(codex, "skills", "use", "SKILL.md"), controllerSkill("Codex"));
  await bundle("src/runtime/hook.ts", join(codex, "runtime", "hook.mjs"));

  const pi = join(dist, "pi", "mouthfeel");
  await json(join(pi, "package.json"), {
    name: "@nielsmadan/mouthfeel-pi",
    version,
    description: "Mouthfeel output profiles for Pi",
    type: "module",
    license: "MIT",
    repository,
    pi: { extensions: ["./index.js"] },
    files: ["index.js", "README.md"],
  });
  await bundleWrapper(
    `import { createPiExtension } from "./src/adapters/pi.ts";\nconst profiles = ${registry};\nexport default createPiExtension(profiles);\n`,
    join(pi, "index.js"),
  );

  const opencode = join(dist, "opencode", "mouthfeel");
  await json(join(opencode, "package.json"), {
    name: "@nielsmadan/opencode-mouthfeel",
    version,
    description: "Mouthfeel output profiles for OpenCode",
    type: "module",
    license: "MIT",
    repository,
    main: "./index.js",
    exports: "./index.js",
    files: ["index.js", "README.md"],
    peerDependencies: { "@opencode-ai/plugin": ">=1.0.0" },
  });
  await bundleWrapper(
    `import { createOpenCodePlugin } from "./src/adapters/opencode.ts";\nconst profiles = ${registry};\nexport const Mouthfeel = createOpenCodePlugin(profiles);\n`,
    join(opencode, "index.js"),
  );

  const antigravity = join(dist, "antigravity", "mouthfeel");
  await json(join(antigravity, "plugin.json"), {
    $schema: "https://antigravity.google/schemas/v1/plugin.json",
    name: "mouthfeel",
    description: "Temporary output styles for coding agents",
  });
  await json(join(antigravity, "hooks.json"), {
    mouthfeel: {
      PreInvocation: [{ type: "command", command: "node ./runtime/hook.mjs", timeout: 5 }],
    },
  });
  await write(join(antigravity, "skills", "mouthfeel", "SKILL.md"), `---
name: mouthfeel
description: Activates or controls a temporary Mouthfeel output profile when the user explicitly invokes /mouthfeel.
---

# Mouthfeel controller

MOUTHFEEL_COMMAND: $ARGUMENTS

The lifecycle hook reads this marker, stores state for the current conversation, and injects only the selected profile before each model invocation. Follow its control-turn instruction exactly. Activation is prospective.

Commands: \`<profile> [1|2|3]\`, \`surprise [1|2|3]\`, \`intensity <1|2|3>\`, \`off\`, \`status\`, \`list\`, and \`untranslate\`.

## Examples

- \`/mouthfeel senior 1\`
- \`/mouthfeel sailor\`
- \`/mouthfeel untranslate\`

## Troubleshooting

Use \`/mouthfeel list\` to see exact profile ids. If a plugin update is not reflected, begin a new conversation so Antigravity reloads the plugin bundle.
`);
  await bundle("src/adapters/antigravity-hook.ts", join(antigravity, "runtime", "hook.mjs"));

  const packageReadme = "# Mouthfeel adapter\n\nThis directory is generated. See https://github.com/nielsmadan/mouthfeel for installation and usage.\n";
  for (const host of [claude, codex, pi, opencode, antigravity]) {
    await write(join(host, "README.md"), packageReadme);
  }
}

await main();
