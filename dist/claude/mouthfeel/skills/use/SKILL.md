---
name: use
description: Activates or controls a temporary Mouthfeel output profile when the user explicitly invokes /mouthfeel:use.
---

# Mouthfeel controller

Pass the invocation arguments to the Mouthfeel lifecycle hook:

MOUTHFEEL_COMMAND: $ARGUMENTS

The hook owns profile selection and session state. Follow the hook's control-turn instruction exactly. Activation is prospective: do not rewrite the preceding reply and do not apply the selected profile to this control response.

## Commands

- `<profile> [1|2|3]`: activate one profile; intensity defaults to 2
- `surprise [1|2|3]`: choose one eligible fun profile
- `intensity <1|2|3>`: change the active intensity
- `off`: return to the host baseline
- `status`: show the active profile
- `list`: list profiles
- `untranslate`: rewrite only the immediately preceding styled reply in the host baseline, then keep the profile active

## Examples

- `/mouthfeel:use senior 1`
- `/mouthfeel:use sailor`
- `/mouthfeel:use untranslate`

## Troubleshooting

If the hook reports an unknown profile, use `/mouthfeel:use list`. If state appears stale after a plugin update, start a new session so the host reloads the package.
