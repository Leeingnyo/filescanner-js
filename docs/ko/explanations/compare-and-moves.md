# 설명: compare와 move 판정

## Diff는 evidence 기반

비교 시 경로가 같은(또는 compareSubtree에서 상대 경로가 같은) 두 노드에 대해 evidence를 만들고 점수화합니다.

- OS file id
- content hash
- VPath / name
- size, mtime 등

그 결과:

- `SAME`, `DIFFERENT`, `POSSIBLY_SAME`, `UNKNOWN`
- (옵션) 강한 충돌 시 `CONFLICT`

구현: `src/compare/match.ts`, `src/compare/DefaultComparer.ts`

## Move 판정은 전역 1:1 매칭

기본 diff가 만든 `ADDED`/`REMOVED`를 후보로, move 전략/최소 confidence 기준으로 1:1 페어를 선택해 `MOVED`로 바꿉니다.

구현: `src/compare/move.ts`

## Coverage 동작 (STRICT vs LENIENT)

- STRICT에서 coverage가 부족하면 `NOT_COVERED`가 될 수 있음
- LENIENT는 coverage 밖의 경로를 `UNKNOWN`으로 처리

관련: `docs/ko/explanations/coverage-and-tombstones.md`

