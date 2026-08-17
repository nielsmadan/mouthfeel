---
id: concept-explanation
type: conceptual-explanation
anchor: false
mustPreserve:
  - Electron userData
  - settings, cookies, IndexedDB, caches, sessions, and the single-instance lock
  - two checkouts can interfere despite different ports
---
Electron is different because the preset expresses an opt-in behavior that detection alone cannot complete.

Every checkout of the same Electron app normally shares Electron’s `userData` directory. That directory contains settings, cookies, IndexedDB, caches, sessions, and the single-instance lock. Running two checkouts can therefore make them interfere even if their renderer servers use different ports.
