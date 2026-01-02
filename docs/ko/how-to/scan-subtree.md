# How-to: 일부만 스캔하기 (subtree / children-only)

`ScanScope`와 `ScopeMode`를 사용합니다.

- `SINGLE_NODE`: `baseVPath` 하나만
- `CHILDREN_ONLY`: `baseVPath`의 “직계 자식”만
- `FULL_SUBTREE`: `baseVPath` 하위 전체

예: `/photos/2025`만 재귀 스캔:

```ts
import { ScopeMode } from 'filescanner';

const scopes = [{ baseVPath: '/photos/2025', mode: ScopeMode.FULL_SUBTREE }];
```

예: `/photos`의 직계 자식만 스캔:

```ts
const scopes = [{ baseVPath: '/photos', mode: ScopeMode.CHILDREN_ONLY }];
```

## 중요한 이유 (삭제 판정 범위)

패치 커밋 시 삭제(tombstone) 판정은 **COMPLETE coverage scope 내부에서만** 수행됩니다.

- `docs/ko/explanations/coverage-and-tombstones.md` 참고
