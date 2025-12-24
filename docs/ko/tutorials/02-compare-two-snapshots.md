# 튜토리얼: 두 스냅샷 비교하기 (diff)

이 문서는 이미 **두 개의 스냅샷**이 존재한다고 가정합니다.

## 1) Comparer 생성

```ts
import { DefaultComparer } from 'filescanner';

const comparer = new DefaultComparer(store);
```

## 2) 옵션 구성

```ts
import { CompareMode, ScopeMode, EvidenceType, ConflictHandling, Confidence } from 'filescanner';

const opts = {
  mode: CompareMode.STRICT,
  scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
  requireObservedCoverage: true,
  identity: {
    // “AUTO”는 Root capabilities를 기반으로 case policy를 해석한다는 의미입니다(spec.md 참고).
    casePolicy: 'AUTO',
    conflictHandling: ConflictHandling.MARK_CONFLICT,
    thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
    strategies: [
      { type: EvidenceType.OS_FILE_ID, weight: 1.0 },
      { type: EvidenceType.CONTENT_HASH, weight: 0.9 },
      { type: EvidenceType.VPATH, weight: 0.3 },
      { type: EvidenceType.SIZE, weight: 0.2 },
      { type: EvidenceType.MTIME, weight: 0.1 }
    ]
  },
  move: { enabled: true, strategies: [EvidenceType.OS_FILE_ID, EvidenceType.CONTENT_HASH], minConfidence: Confidence.LIKELY }
};
```

## 3) 비교 실행

```ts
const result = comparer.compare(leftSnapshotId, rightSnapshotId, opts);
console.log(result.summary);
console.log(result.entries.slice(0, 20));
```

## Coverage 의미

`requireObservedCoverage=true`이면, 두 스냅샷의 “마지막 완료 run coverage”가 요청 scope를 커버하지 않을 때 `NOT_COVERED`가 됩니다.

- `docs/ko/explanations/coverage-and-tombstones.md` 참고
