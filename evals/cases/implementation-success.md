---
id: implementation-success
type: implementation-result
anchor: true
mustPreserve:
  - cadet ls --all-projects
  - cadet ls --all-projects --all
  - Markdown and SQLite
  - conflicts with --project
  - workspace tests and Clippy pass
---
Implemented `--all-projects` for `cadet ls`.

```sh
# Active tasks across every project
cadet ls --all-projects

# Including completed/terminal tasks
cadet ls --all-projects --all
```

Results are grouped by project and work across Markdown and SQLite backends. Existing filters also remain available. `--all-projects` conflicts with selecting one `--project`.

All workspace tests and Clippy pass.
