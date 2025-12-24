# Tutorial: compare two snapshots (diff)

This tutorial assumes you already have **two snapshots** for (possibly) the same root.

## 1) Create a comparer

```ts
import { DefaultComparer, CompareMode, ScopeMode, EvidenceType, ConflictHandling, Confidence } from 'filescanner';

const comparer = new DefaultComparer(store);
```

## 2) Build options

```ts
const opts = {
  mode: CompareMode.STRICT,
  scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
  requireObservedCoverage: true,
  identity: {
    // “AUTO” means resolve from root capabilities (see spec.md).
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

## 3) Compare

```ts
const result = comparer.compare(leftSnapshotId, rightSnapshotId, opts);
console.log(result.summary);
console.log(result.entries.slice(0, 20));
```

## What “coverage” means here

If `requireObservedCoverage=true`, the comparer returns `NOT_COVERED` unless both snapshots’ *last completed run coverage* covers the requested scope. See:

- `docs/en/explanations/coverage-and-tombstones.md`

