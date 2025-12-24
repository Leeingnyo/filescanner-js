# 설명: coverage와 tombstone(삭제 노드)

## Coverage는 “마지막 완료 run에서 스캔한 범위”

패치 커밋을 하려면 coverage를 기록해야 합니다.

- `PatchSession.recordCoverage(coverage)`
- `PatchSession.commit()`

스냅샷에는 `snapshot.lastCoverage`로 “마지막 완료 run의 coverage”만 저장됩니다(누적 아님).

이 값은:

- Compare(STRICT/LENIENT)
- Alignment(NOT_COVERED/UNKNOWN)

에 직접 영향을 줍니다.

## Tombstone(삭제)

삭제 판정은 커밋 시점에 coverage scope 내부에서만 수행됩니다.

- coverage 내부에 있었는데 이번 run에서 관측되지 않으면 `isDeleted=true`
- 기본 쿼리는 삭제 노드를 제외하며, `includeDeleted=true`로 포함 가능

## 실전 팁

- 안정적인 diff가 필요하면 항상 일정한 coverage로 스캔하세요.
- 부분 스캔을 자주 한다면 LENIENT 비교 또는 `requireObservedCoverage=false` 사용을 고려하세요.

