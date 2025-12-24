# 설명: alignment row key 계산

Alignment는 행 키가 결정적이어야 합니다.

## 전략

`AlignKeyStrategy`:

- `VPATH`
- `ENTITY_KEY`
- `OS_FILE_ID`
- `CONTENT_HASH`
- `COMPOSITE(parts)`

## rowKey 도출

스펙상 `rowKey = "rk:" + sha256("align:<strategy>\u001f<input>")` 형태입니다.

구현: `src/align/alignKey.ts`

## 한 셀에 여러 후보가 들어갈 때

같은 스냅샷에서 동일 rowKey로 매칭되는 노드가 여러 개면:

- `AlignmentCell.nodes[]`에 모두 들어갑니다.
- 정렬은 OS-layer 우선 → canonical string 순서입니다.

구현: `src/align/DefaultAligner.ts`

