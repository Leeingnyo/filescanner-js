# 레퍼런스: 코어 타입

여기서는 중요한 타입의 “형태”를 빠르게 요약합니다.
정의의 근거는 `src/types/*`와 `spec.md`입니다.

## IDs / primitives

- `RootId`, `SnapshotId`, `RunId`, `NodeId`: `string`
- `Instant`: RFC3339 타임스탬프 `string`
- `VPath`: 정규화된 가상 경로 `string`

## NodeKind / Error

- `NodeKind`: `FILE | DIR | SYMLINK | SPECIAL`
- `NodeError`: `{ code, stage, message, retryable, osCode?, at }`

## Ref / layers

- `NodeRef`: `{ rootId, layers, vpath }`
- `VfsLayerArchive`: `{ kind: ARCHIVE, format, containerVPath }`

## Scan / Store

- `ObservedNode`: 스캐너 출력
- `NodeMeta`: 스토어 저장 형태(식별/삭제/관측 메타 포함)
- `Coverage`: `{ runId, scopes: CoverageScope[] }`
- `CoverageScope`: `{ scope, completeness, errors? }`
