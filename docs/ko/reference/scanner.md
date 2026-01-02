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
