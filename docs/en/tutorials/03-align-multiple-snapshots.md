# Tutorial: align multiple snapshots (matrix)

Alignment creates a table-like view where each row is a logical “same thing” key and each column is a snapshot.

## 1) Create an aligner

```ts
import { DefaultAligner, AlignKeyType, CompareMode, ScopeMode } from 'filescanner';

const aligner = new DefaultAligner(store);
```

## 2) Align by a key

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

## Tips

- Use `{ type: AlignKeyType.ENTITY_KEY }` to track files through renames (when entity keys are stable).
- Use `{ type: AlignKeyType.COMPOSITE, parts: [AlignKeyType.ENTITY_KEY, AlignKeyType.VPATH] }` to reduce accidental collisions.

For how row keys are derived, see `docs/en/explanations/alignment-row-keys.md`.

