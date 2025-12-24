# 튜토리얼: 파일 작업(OperationPlan) 실행하기

`FileExecutor`로 `OperationPlan`을 실행하는 예시입니다.

## 1) Executor 생성

```ts
import { FileExecutor, ArchiveRegistry, ZipArchiveReader } from 'filescanner';

const executor = new FileExecutor(rootsResolver, new ArchiveRegistry([new ZipArchiveReader()]));
```

`rootsResolver`는 `RootResolver`(= `getRoot(rootId)`)를 구현해야 합니다.

## 2) Plan 준비

```ts
import { ConflictPolicy, OpType } from 'filescanner';

const plan = {
  planId: 'p:1',
  createdAt: new Date().toISOString(),
  ops: [
    {
      opId: 'op:copy-1',
      type: OpType.COPY,
      src: { rootId: 'r:1', layers: [{ kind: 'OS', rootId: 'r:1' }], vpath: '/a.txt' },
      dst: { rootId: 'r:1', vpath: '/out/a.txt' },
      policy: { conflict: ConflictPolicy.RENAME }
    }
  ]
};
```

## 3) Dry-run (사전 점검)

```ts
const checked = await executor.dryRun(plan);
console.log(checked.preflight);
```

## 4) 실행 + 콜백

```ts
await executor.execute(checked, {
  onStarted: (p) => console.log('started', p.planId),
  onOpStarted: (op) => console.log('op start', op.opId),
  onOpFinished: (op, res) => console.log('op done', op.opId, res.status),
  onError: (e) => console.warn('error', e),
  onFinished: (r) => console.log('finished', r.results.length)
});
```

## 제약(스펙 기반)

- `MOVE`, `DELETE`는 OS-layer source만 허용됩니다.
- `COPY`는 archive-layer source도 가능(추출).

