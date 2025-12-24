# Reference: public API (exports)

The library’s public exports are defined in `src/index.ts`.

## Main classes

- `MemorySnapshotStore`
- `SqliteSnapshotStore`
- `FileSystemScanner`
- `DefaultComparer`
- `DefaultAligner`
- `FileExecutor`
- `DefaultVfs`
- `VfsResolver`
- `ArchiveRegistry`
- `ZipArchiveReader`

## Types (selected)

- Roots: `RootDescriptor`, `RootCapabilities`
- Paths/refs: `VPath`, `NodeRef`, `VfsLayer*`
- Scan: `ScanRequest`, `ScanRun`, `ScanScope`, `Coverage`, `ScanPolicy`, `IgnoreRules`
- Store: `Snapshot`, `NodeMeta`, `ObservedNode`, `NodeQuery`, `NodeQueryResult`
- Compare: `CompareOptions`, `DiffResult`, `DiffEntry`, `MatchResult`
- Align: `AlignmentResult`, `AlignmentRow`, `AlignmentCell`
- Ops: `OperationPlan`, `Operation`, `ExecutionReport`

For details, read:

- `docs/en/reference/types.md`
- `docs/en/reference/scanner.md`
- `docs/en/reference/stores.md`
- `docs/en/reference/compare-align.md`
- `docs/en/reference/ops-and-vfs.md`

