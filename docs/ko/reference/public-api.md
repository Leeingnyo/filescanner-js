# 레퍼런스: 공개 API (exports)

공개 export는 `src/index.ts`에 정의되어 있습니다.

## 주요 클래스

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

## 주요 타입(요약)

- Roots: `RootDescriptor`, `RootCapabilities`
- Paths/refs: `VPath`, `NodeRef`, `VfsLayer*`
- Scan: `ScanRequest`, `ScanRun`, `ScanScope`, `Coverage`, `ScanPolicy`, `IgnoreRules`
- Store: `Snapshot`, `NodeMeta`, `ObservedNode`, `NodeQuery`, `NodeQueryResult`
- Compare: `CompareOptions`, `DiffResult`, `DiffEntry`, `MatchResult`
- Align: `AlignmentResult`, `AlignmentRow`, `AlignmentCell`
- Ops: `OperationPlan`, `Operation`, `ExecutionReport`

자세한 내용:

- `docs/ko/reference/types.md`
- `docs/ko/reference/scanner.md`
- `docs/ko/reference/stores.md`
- `docs/ko/reference/compare-align.md`
- `docs/ko/reference/ops-and-vfs.md`

