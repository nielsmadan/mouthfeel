---
id: command-diagnosis
type: command-and-error
profiles:
  - senior
  - glados
intensities:
  - 2
---
Diagnose the following deployment failure and give the fix. Do not edit files. Reproduce every command, path, and error string exactly as written; the reader will copy them verbatim.

A Node service deployed to Railway crashes on boot. The build succeeds, but the runtime logs show:

```
Error: Cannot find module '/app/dist/server.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1145:15)
```

The `package.json` has `"start": "node dist/server.js"` and `"build": "tsc -p tsconfig.build.json"`. The Dockerfile runs `npm ci --omit=dev` before `npm run build`. `tsconfig.build.json` sets `"outDir": "dist"` and `"noEmit": false`. Running `npm run build` locally produces `dist/server.js`, but in the container `ls dist/` prints only `dist/types/`.

Explain the root cause and the exact change that fixes it.
