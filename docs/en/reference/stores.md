# Reference: snapshot stores

All stores implement the `SnapshotStore` interface (`src/store/SnapshotStore.ts`).

## Patch lifecycle

1) `beginPatch(snapshotId, run) -> PatchSession`
2) `PatchSession.upsertNodes(batch)`
3) `PatchSession.recordCoverage(coverage)`
4) `PatchSession.commit()` (or `abort()`)

## Implementations

### `MemorySnapshotStore`

- Fast, in-memory, good for tests and ephemeral usage.
- Implements the spec’s tombstone and coverage semantics.

### `SqliteSnapshotStore`

- Persistent store backed by `better-sqlite3`.
- Provides indices for common queries (entity key, identity, hashes).
- `close()` is available on this class (not part of the `SnapshotStore` interface).

