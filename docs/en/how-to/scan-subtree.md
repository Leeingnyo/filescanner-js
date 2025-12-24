# How-to: scan only a subtree (or only immediate children)

Use `ScanScope` with `ScopeMode`:

- `SINGLE_NODE`: only `baseVPath`
- `CHILDREN_ONLY`: only immediate children under `baseVPath`
- `FULL_SUBTREE`: entire subtree under `baseVPath`

Example: scan only `/photos/2025` recursively:

```ts
import { ScopeMode } from 'filescanner';

const scopes = [{ baseVPath: '/photos/2025', mode: ScopeMode.FULL_SUBTREE }];
```

Example: scan only immediate children of `/photos`:

```ts
const scopes = [{ baseVPath: '/photos', mode: ScopeMode.CHILDREN_ONLY }];
```

## Why this matters (patch deletion reconciliation)

Deletion marking happens **only inside recorded coverage scopes** when you commit a patch session.

See `docs/en/explanations/coverage-and-tombstones.md`.

