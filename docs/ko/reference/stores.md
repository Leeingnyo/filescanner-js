# 레퍼런스: 스냅샷 스토어

모든 스토어는 `SnapshotStore`(`src/store/SnapshotStore.ts`)를 구현합니다.

## Patch lifecycle

1) `beginPatch(snapshotId, run) -> PatchSession`
2) `PatchSession.upsertNodes(batch)`
3) `PatchSession.recordCoverage(coverage)`
4) `PatchSession.commit()` (또는 `abort()`)

참고:

- 삭제 판정은 `completeness=COMPLETE`인 scope에서만 수행됩니다.

## 구현체

### `MemorySnapshotStore`

- 인메모리, 테스트/임시 사용에 적합
- tombstone/coverage 의미를 스펙대로 구현

### `SqliteSnapshotStore`

- `better-sqlite3` 기반 영속 스토어
- 자주 쓰는 쿼리(entityKey/identity/hash 등)에 인덱스 제공
- `close()` 메서드가 있습니다(인터페이스에는 없음)
