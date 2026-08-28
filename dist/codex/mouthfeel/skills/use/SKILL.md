---
name: use
description: Activates or controls a temporary Mouthfeel output profile when the user explicitly invokes $mouthfeel:use.
---

# Mouthfeel controller

Only acknowledge success when the Mouthfeel lifecycle hook supplied a Mouthfeel control-turn instruction in developer context. Follow that instruction exactly and return only that response. If no Mouthfeel control-turn instruction is present, use the fallback. Respond exactly: Mouthfeel hook did not run; profile unchanged. Never infer success from this invocation alone. Profile selection and surprise may request a brief activation greeting in the selected profile. Do not rewrite the preceding reply; substantive replies remain prospective. Do not apply the profile to other control responses.

## Commands

- `<profile> [1|2|3]`: activate one profile; intensity defaults to 2
- `surprise [1|2|3]`: choose one eligible fun profile
- `intensity <1|2|3>`: change the active intensity
- `off`: return to the host baseline
- `status`: show the active profile
- `list`: list profiles
- `untranslate`: rewrite only the immediately preceding styled reply in the host baseline, then keep the profile active

## Examples

- `$mouthfeel:use senior 1`
- `$mouthfeel:use sailor`
- `$mouthfeel:use untranslate`

## Troubleshooting

If the hook reports an unknown profile, use `$mouthfeel:use list`. If state appears stale after a plugin update, start a new session so the host reloads the package.
