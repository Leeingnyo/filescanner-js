# 레퍼런스: VFS / Resolver / Operations

## VFS

- `Vfs.listChildren(ref) -> Promise<NodeRef[]>`
- `Vfs.stat(ref) -> Promise<NodeMeta>`
- `Vfs.openRead(ref) -> Promise<ReadableStream>`

구현: `DefaultVfs`

## Resolver

- `Resolver.statNow(ref) -> Promise<{ exists, meta?, error? }>`

구현: `VfsResolver`

## Operations

- `FileExecutor.dryRun(plan) -> OperationPlan` (`preflight` 추가)
- `FileExecutor.execute(plan, sink) -> { report, control }`

제약:

- `MOVE`, `DELETE`는 OS-layer source 필요
- `COPY`는 archive-layer source도 가능

