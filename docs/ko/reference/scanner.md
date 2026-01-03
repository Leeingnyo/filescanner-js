# 레퍼런스: 스캔 API

## Interfaces

- `Scanner.startScan(req, sink) -> { run, control }`
- `ScanSink`: `onRunStarted`, `onNodes`, `onError`, `onRunFinished`
- `ScanControl.cancel()` (pause/resume는 optional)

## 구현: `FileSystemScanner`

OS 파일시스템을 스캔하고 `ObservedNode` 배치를 emit 합니다.

참고:

- 내부는 sync I/O로 동작합니다(외부는 콜백 기반).
- POSIX identity(`dev`/`inode`)는 `RootCapabilities.supportsFileId=true`일 때만 기록됩니다.
- Windows 파일 ID와 content hash는 현재 스캐너가 계산하지 않습니다.
- ignore 규칙은 정규화된 VPath 문자열을 기준으로 적용됩니다.

## 앱 측 후처리(예: 콘텐츠 해싱)

스캐너는 메타데이터만 열거합니다. 콘텐츠 해싱이나 별도 처리가 필요하면 `ScanSink.onNodes`에서 작업을 큐에 넣고, **같은 runId로 재-upsert** 해서 `hashes`를 채우면 됩니다.

간단 패턴:

```ts
let patch: PatchSession | undefined;
const hashQueue: ObservedNode[] = [];

onRunStarted(run) {
  patch = store.beginPatch(snapshotId, run);
}

onNodes(batch) {
  patch?.upsertNodes(batch);              // 먼저 메타 저장
  hashQueue.push(...batch.filter(isFile));
}

onRunFinished(run, coverage) {
  const hashed = hashQueue.map(withHash); // Vfs.openRead(ref) + stream 해시
  patch?.upsertNodes(hashed);             // 같은 runId로 해시 채움
  patch?.recordCoverage(coverage);
  patch?.commit();
}
```

팁: 해싱을 병렬로 돌리더라도 upsert는 단일 writer(collector)로 처리하는 편이 안전합니다.
