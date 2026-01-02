# Tutorial: quickstart (scan → snapshot)

This tutorial shows the smallest end-to-end loop:

1) Register a root
2) Create a snapshot
3) Scan and stream `ObservedNode` batches
4) Persist via a `PatchSession` and commit coverage

## 1) Setup

```ts
import { ArchiveRegistry, ZipArchiveReader, FileSystemScanner, MemorySnapshotStore } from 'filescanner';
import { CasePolicy, OsKind } from 'filescanner';

const store = new MemorySnapshotStore();

const root = store.registerRoot({
  rootId: 'r:1',
  // Must follow the normalization rules in spec.md (posixpath:/..., winpath:C:\...).
  rootKey: 'posixpath:/absolute/path/to/root',
  os: OsKind.POSIX,
  osPath: '/absolute/path/to/root',
  createdAt: new Date().toISOString(),
  casePolicy: CasePolicy.AUTO,
  capabilities: { caseSensitive: true, supportsFileId: false }
});

const snapshot = store.createSnapshot(root.rootId);

const archives = new ArchiveRegistry([new ZipArchiveReader()]);
const scanner = new FileSystemScanner(store, archives);
```

## 2) Run a scan and commit it into the snapshot

`FileSystemScanner.startScan()` is callback-driven. Create a Promise that resolves when `onRunFinished` fires.

```ts
import { ScopeMode, RunStatus, ErrorPolicy, SymlinkPolicy } from 'filescanner';

await new Promise<void>((resolve, reject) => {
  let session: ReturnType<typeof store.beginPatch> | undefined;

  const sink = {
    onRunStarted(run: any) {
      session = store.beginPatch(snapshot.snapshotId, run);
    },
    onNodes(batch: any[]) {
      session?.upsertNodes(batch);
    },
    onError(error: any) {
      // Depending on your app, you may want to log or aggregate.
      // Note: per spec, node-attributable errors should also be attached to the node.
      void error;
    },
    onRunFinished(run: any, coverage: any) {
      try {
        session?.recordCoverage(coverage);
        session?.commit();
        if (run.status !== RunStatus.FINISHED) {
          throw new Error(`Scan did not finish: ${run.status}`);
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    }
  };

  scanner.startScan(
    {
      snapshotId: snapshot.snapshotId,
      rootId: root.rootId,
      scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
      policy: {
        errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
        symlinkPolicy: SymlinkPolicy.FOLLOW_SAFE,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 8, cpu: 2 }
    },
    sink as any
  );
});
```

## 3) Inspect results

```ts
const updated = store.getSnapshot(snapshot.snapshotId);
console.log(updated.stats); // { nodeCount, dirCount, fileCount }

import { LayerKind } from 'filescanner';

const rootRef = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/' };
const children = store.listChildren(snapshot.snapshotId, rootRef).nodes;
```

## Notes / current implementation details

- `FileSystemScanner` captures POSIX `dev`/`inode` only when `RootCapabilities.supportsFileId=true`.
- Windows file IDs and content hashes are not computed by the current scanner.
- The `concurrency` field exists in the API but is not used by the current scanner implementation.
