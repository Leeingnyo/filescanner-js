# Explanation: compare and move detection

## Diff is evidence-based

When comparing two nodes at the same path (or in `compareSubtree`, the same relative path), the comparer builds an evidence list from the configured strategy:

- OS file ID
- content hash
- VPath / name
- size, mtime, etc.

Then it scores matches and mismatches and produces:

- `SAME`, `DIFFERENT`, `POSSIBLY_SAME`, `UNKNOWN`
- and optionally a `CONFLICT` entry if “strong conflict” is detected and `conflictHandling=MARK_CONFLICT`

Implementation: `src/compare/match.ts`, `src/compare/DefaultComparer.ts`.

## Move detection is a global 1:1 pairing

After producing `ADDED` and `REMOVED`, move detection tries to pair candidates into `MOVED` entries based on the configured move strategy and minimum confidence.

Implementation: `src/compare/move.ts`.

## Coverage behavior (STRICT vs LENIENT)

- STRICT + uncovered scope → `NOT_COVERED` if required
- LENIENT + uncovered paths → `UNKNOWN` instead of `ADDED/REMOVED`

See `docs/en/explanations/coverage-and-tombstones.md`.

