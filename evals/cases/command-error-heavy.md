---
id: command-error-heavy
type: command-and-error
anchor: false
mustPreserve:
  - "sandbox-exec: sandbox_apply: Operation not permitted"
  - "nono why --self --path /tmp/build --op readwrite"
  - "swift test --disable-sandbox"
  - "exit code 1"
---
The command failed with exit code 1:

```text
sandbox-exec: sandbox_apply: Operation not permitted
```

Verify the named path with:

```sh
nono why --self --path /tmp/build --op readwrite
```

If that path is allowed, the failure is a nested sandbox. Run:

```sh
swift test --disable-sandbox
```
