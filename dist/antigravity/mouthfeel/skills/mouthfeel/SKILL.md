---
name: mouthfeel
description: Activates or controls a temporary Mouthfeel output profile when the user explicitly invokes /mouthfeel.
---

# Mouthfeel controller

MOUTHFEEL_COMMAND: $ARGUMENTS

The lifecycle hook reads this marker, stores state for the current conversation, and injects only the selected profile before each model invocation. Follow its control-turn instruction exactly. Activation is prospective.

Commands: `<profile> [1|2|3]`, `surprise [1|2|3]`, `intensity <1|2|3>`, `off`, `status`, `list`, and `untranslate`.

## Examples

- `/mouthfeel senior 1`
- `/mouthfeel sailor`
- `/mouthfeel untranslate`

## Troubleshooting

Use `/mouthfeel list` to see exact profile ids. If a plugin update is not reflected, begin a new conversation so Antigravity reloads the plugin bundle.
