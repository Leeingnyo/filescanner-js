# Explanation: alignment row keys

Alignment (“matrix view”) needs a deterministic row key.

## Strategies

`AlignKeyStrategy` supports:

- `VPATH`
- `ENTITY_KEY`
- `OS_FILE_ID`
- `CONTENT_HASH`
- `COMPOSITE(parts)`

## Row key derivation

Per spec, the row key is a sha256 hash of a strategy name and an input string, prefixed with `rk:`.

Implementation: `src/align/alignKey.ts`.

## Cells with multiple candidates

If more than one node in the same snapshot maps to the same row key:

- `AlignmentCell.nodes[]` contains all candidates
- Candidates are ordered deterministically:
  - OS-layer nodes before archive-layer nodes
  - then by canonical string

Implementation: `src/align/DefaultAligner.ts`.

