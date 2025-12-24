# FileScanner docs (English)

FileScanner is a small, spec-driven core library for:

- Scanning OS directories into a normalized virtual namespace (`VPath` / `NodeRef`)
- (Optionally) treating archives as directories via layered refs
- Persisting scan results as **snapshots** with incremental **patch** sessions
- Producing deterministic **2-way diffs** and multi-snapshot **alignment**
- Executing safe file operations (copy/move/delete/mkdir) with dry-run and progress callbacks

The normative behavior is defined in `spec.md` (repo root). The TypeScript implementation in `src/` aims to follow it.

## Where to start (recommended reading order)

1) Tutorial: `docs/en/tutorials/01-quickstart.md`
2) Explanation: `docs/en/explanations/core-model.md`
3) How-to: `docs/en/how-to/scan-subtree.md`
4) Tutorial: `docs/en/tutorials/02-compare-two-snapshots.md`
5) Reference: `docs/en/reference/public-api.md`

If you prefer to start from code:

- Public exports: `src/index.ts`
- Core scan flow: `src/scanner/FileSystemScanner.ts`
- Storage model: `src/store/SnapshotStore.ts`, `src/store/memory/MemorySnapshotStore.ts`, `src/store/sqlite/SqliteSnapshotStore.ts`
- Diff/alignment: `src/compare/DefaultComparer.ts`, `src/align/DefaultAligner.ts`
- Ops: `src/ops/FileExecutor.ts`

## Documentation map (4-Document Model)

### Tutorials (learning-oriented)

- `docs/en/tutorials/01-quickstart.md`
- `docs/en/tutorials/02-compare-two-snapshots.md`
- `docs/en/tutorials/03-align-multiple-snapshots.md`
- `docs/en/tutorials/04-execute-operations.md`

### How-to guides (goal-oriented)

- `docs/en/how-to/scan-subtree.md`
- `docs/en/how-to/ignore-patterns.md`
- `docs/en/how-to/scan-zip-archives.md`
- `docs/en/how-to/persist-sqlite.md`
- `docs/en/how-to/query-nodes.md`
- `docs/en/how-to/resolve-node-now.md`

### Explanations (understanding-oriented)

- `docs/en/explanations/vpath-and-rootkey.md`
- `docs/en/explanations/core-model.md`
- `docs/en/explanations/coverage-and-tombstones.md`
- `docs/en/explanations/archives-as-layers.md`
- `docs/en/explanations/compare-and-moves.md`
- `docs/en/explanations/alignment-row-keys.md`

### Reference (information-oriented)

- `docs/en/reference/public-api.md`
- `docs/en/reference/types.md`
- `docs/en/reference/scanner.md`
- `docs/en/reference/stores.md`
- `docs/en/reference/compare-align.md`
- `docs/en/reference/ops-and-vfs.md`

