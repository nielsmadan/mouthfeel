---
id: diagnosis-tradeoff
type: diagnosis
anchor: true
mustPreserve:
  - shared SQLite index
  - Markdown projects scan task files
  - SQLite projects reconcile against their project database
  - reconciliation happens before the index query
  - unchanged runs scale with project count and size
---
Cadet keeps a shared SQLite index, and `ls` reads its results from that index.

However, the index is not currently trusted without checking the source first. Before every command, Cadet reconciles each selected project. Markdown projects scan their task files, while SQLite projects reconcile against their project database. Only afterward does it query the shared index.

So the database is an index plus reconciliation state, not a “never inspect files again” cache. That explains the delay: `cadet ls --all-projects` scales with the number and size of projects even when nothing changed.
