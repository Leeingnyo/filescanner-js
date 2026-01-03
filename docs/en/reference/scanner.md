# Reference: scanning APIs

## Interfaces

- `Scanner.startScan(req, sink) -> { run, control }`
- `ScanSink` callbacks: `onRunStarted`, `onNodes`, `onError`, `onRunFinished`
- `ScanControl.cancel()` (pause/resume are optional)

## Implementation: `FileSystemScanner`

`FileSystemScanner` scans the OS filesystem under a registered root and emits `ObservedNode` batches.

Notes:

- The current implementation is synchronous I/O internally (callback-driven outward).
- POSIX identity (`dev`/`inode`) is captured only when `RootCapabilities.supportsFileId=true`.
- Windows file IDs and content hashes are not computed by the current scanner.
- Ignore rules are applied against the normalized VPath form.

## App-side post-processing (example: content hashing)

The scanner only enumerates metadata. If you want content hashing or other file-level processing, use `ScanSink.onNodes` to enqueue work and then **re-upsert** the same nodes with hashes filled in (same `runId`).

Minimal pattern:

```ts
let patch: PatchSession | undefined;
const hashQueue: ObservedNode[] = [];

onRunStarted(run) {
  patch = store.beginPatch(snapshotId, run);
}

onNodes(batch) {
  patch?.upsertNodes(batch);              // store metadata first
  hashQueue.push(...batch.filter(isFile));
}

onRunFinished(run, coverage) {
  const hashed = hashQueue.map(withHash); // use Vfs.openRead(ref) + stream hash
  patch?.upsertNodes(hashed);             // same runId, fills hashes
  patch?.recordCoverage(coverage);
  patch?.commit();
}
```

Tip: keep the writer single-threaded (collector-style) if you parallelize hashing.
