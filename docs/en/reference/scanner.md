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
