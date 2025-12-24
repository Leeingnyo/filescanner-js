# Reference: VFS, resolver, and operations

## VFS

- `Vfs.listChildren(ref) -> Promise<NodeRef[]>`
- `Vfs.stat(ref) -> Promise<NodeMeta>`
- `Vfs.openRead(ref) -> Promise<ReadableStream>`

Implementation: `DefaultVfs`

## Resolver

- `Resolver.statNow(ref) -> Promise<{ exists, meta?, error? }>`

Implementation: `VfsResolver`

## Operations

- `FileExecutor.dryRun(plan) -> OperationPlan` (adds `preflight`)
- `FileExecutor.execute(plan, sink) -> { report, control }`

Constraints:

- `MOVE` and `DELETE` require OS-layer sources.
- `COPY` may read from archive-layer sources via the VFS.

