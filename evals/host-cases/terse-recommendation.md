---
id: terse-recommendation
type: recommendation
profiles:
  - sailor
  - senior
intensities:
  - 2
---
A team runs a 3-node Postgres cluster for a read-heavy analytics API. Reads are 95% of traffic and already hit a 40ms p99; writes are rare and small. They are considering adding Redis in front of Postgres to cut read latency further. Recommend whether to add Redis now, and say what you would measure first. Keep it to a short recommendation and a first step. Do not edit files.
