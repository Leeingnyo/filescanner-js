# Tutorial: execute a file operation plan

This tutorial demonstrates running a prepared `OperationPlan` using `FileExecutor`.

## 1) Create an executor

```ts
import { FileExecutor, ArchiveRegistry, ZipArchiveReader, ConflictPolicy, OpType, LayerKind } from 'filescanner';

const executor = new FileExecutor(rootsResolver, new ArchiveRegistry([new ZipArchiveReader()]));
```

`rootsResolver` must implement `RootResolver` (`getRoot(rootId)`).

## 2) Prepare a plan

```ts
const plan = {
  planId: 'p:1',
  createdAt: new Date().toISOString(),
  ops: [
    {
      opId: 'op:copy-1',
      type: OpType.COPY,
      src: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/a.txt' },
      dst: { rootId: 'r:1', vpath: '/out/a.txt' },
      policy: { conflict: ConflictPolicy.RENAME }
    }
  ]
};
```

## 3) Dry-run (preflight)

```ts
const checked = await executor.dryRun(plan);
console.log(checked.preflight);
```

## 4) Execute with callbacks

```ts
await executor.execute(checked, {
  onStarted: (p) => console.log('started', p.planId),
  onOpStarted: (op) => console.log('op start', op.opId),
  onOpFinished: (op, res) => console.log('op done', op.opId, res.status),
  onError: (e) => console.warn('error', e),
  onFinished: (r) => console.log('finished', r.results.length)
});
```

## Important constraints (per spec.md)

- `MOVE` and `DELETE` require OS-layer sources.
- `COPY` may use archive-layer sources (extract).
