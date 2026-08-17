---
id: recommendation
type: recommendation
anchor: false
mustPreserve:
  - persist a tiny per-session record
  - compaction and resume
  - profile id, intensity, last-reply flag, and timestamp
  - no transcript content
---
Persist a tiny per-session record for hosts whose native session metadata does not survive compaction and resume. Store only the profile id, intensity, whether the last reply was styled, and a timestamp. Do not store transcript content. Use atomic writes, user-only permissions, and prune stale records after 90 days.
