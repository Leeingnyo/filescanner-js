# Explanation: coverage and tombstones

## Coverage is “what was scanned in the last completed run”

Each scan run has a set of requested scopes (`ScanScope[]`). When you commit a patch session, you must record coverage:

- `PatchSession.recordCoverage(coverage)`
- `PatchSession.commit()`

The snapshot stores `snapshot.lastCoverage` as the coverage of the **last completed run** (not cumulative across history).

Coverage is recorded per-scope as:

- `CoverageScope = { scope, completeness, errors? }`
- `completeness` is either `COMPLETE` or `PARTIAL`
- `errors` may include representative failures that caused partial coverage

This matters for:

- Compare (STRICT vs LENIENT)
- Alignment (NOT_COVERED vs UNKNOWN)

## Tombstones (deleted nodes)

Deletion detection happens at patch commit time, and only inside **COMPLETE** covered scopes:

- If a node existed in the snapshot under a covered scope, but was not observed in the new run, it becomes `isDeleted=true`.
- Deleted nodes remain in the store (tombstones) until a purge mechanism is applied (optional per spec).

Default query behavior excludes tombstones unless `includeDeleted=true`.

## Practical guidance

- If you want stable diffs, always run scans with consistent coverage scopes.
- If you do partial scans, be explicit: compare in LENIENT mode, or set `requireObservedCoverage=false` if your application can tolerate ambiguity.
