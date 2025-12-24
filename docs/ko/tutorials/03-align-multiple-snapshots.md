# 튜토리얼: 여러 스냅샷 정렬(alignment)하기 (행렬)

Alignment는 “행(row) = 같은 대상 키”, “열(column) = 스냅샷” 형태의 표를 만듭니다.

## 1) Aligner 생성

```ts
import { DefaultAligner, AlignKeyType, CompareMode, ScopeMode } from 'filescanner';

const aligner = new DefaultAligner(store);
```

## 2) 키 기준으로 정렬

```ts
const result = aligner.align(
  [s1, s2, s3],
  { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
  { type: AlignKeyType.VPATH },
  CompareMode.STRICT
);

console.log(result.rows.length);
console.log(result.rows[0]);
```

## 팁

- `{ type: AlignKeyType.ENTITY_KEY }`는 rename 추적에 유리합니다(엔티티 키가 안정적이라면).
- `{ type: AlignKeyType.COMPOSITE, parts: [AlignKeyType.ENTITY_KEY, AlignKeyType.VPATH] }`로 충돌을 줄일 수 있습니다.

행 키 계산 방식은 `docs/ko/explanations/alignment-row-keys.md` 참고.
