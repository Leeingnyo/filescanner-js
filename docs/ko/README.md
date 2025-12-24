# FileScanner 문서 (한국어)

FileScanner는 다음을 목표로 하는 작은(그러나 스펙 기반의) 코어 라이브러리입니다.

- OS 디렉터리를 정규화된 가상 네임스페이스(`VPath` / `NodeRef`)로 스캔
- (선택) 아카이브(zip 등)를 “디렉터리처럼” 취급하기 위한 레이어드 레퍼런스
- 스캔 결과를 **스냅샷**으로 저장하고, 증분 **패치** 세션으로 갱신
- 결정적(deterministic)인 **2-way diff** 및 다중 스냅샷 **alignment(행렬)** 제공
- 안전한 파일 작업(copy/move/delete/mkdir) 실행(dry-run, 진행 콜백)

규범적 정의는 저장소 루트의 `spec.md`에 있습니다. `src/`의 TypeScript 구현은 이를 따르도록 작성되어 있습니다.

## 어디부터 보면 좋을까? (추천 순서)

1) 튜토리얼: `docs/ko/tutorials/01-quickstart.md`
2) 설명: `docs/ko/explanations/core-model.md`
3) How-to: `docs/ko/how-to/scan-subtree.md`
4) 튜토리얼: `docs/ko/tutorials/02-compare-two-snapshots.md`
5) 레퍼런스: `docs/ko/reference/public-api.md`

코드를 먼저 보고 싶다면:

- 공개 export: `src/index.ts`
- 스캔 흐름: `src/scanner/FileSystemScanner.ts`
- 저장소: `src/store/SnapshotStore.ts`, `src/store/memory/MemorySnapshotStore.ts`, `src/store/sqlite/SqliteSnapshotStore.ts`
- diff/alignment: `src/compare/DefaultComparer.ts`, `src/align/DefaultAligner.ts`
- 파일 작업: `src/ops/FileExecutor.ts`

## 문서 맵 (4-Document Model)

### Tutorials (학습 중심)

- `docs/ko/tutorials/01-quickstart.md`
- `docs/ko/tutorials/02-compare-two-snapshots.md`
- `docs/ko/tutorials/03-align-multiple-snapshots.md`
- `docs/ko/tutorials/04-execute-operations.md`

### How-to (목표 달성 중심)

- `docs/ko/how-to/scan-subtree.md`
- `docs/ko/how-to/ignore-patterns.md`
- `docs/ko/how-to/scan-zip-archives.md`
- `docs/ko/how-to/persist-sqlite.md`
- `docs/ko/how-to/query-nodes.md`
- `docs/ko/how-to/resolve-node-now.md`

### Explanations (이해 중심)

- `docs/ko/explanations/vpath-and-rootkey.md`
- `docs/ko/explanations/core-model.md`
- `docs/ko/explanations/coverage-and-tombstones.md`
- `docs/ko/explanations/archives-as-layers.md`
- `docs/ko/explanations/compare-and-moves.md`
- `docs/ko/explanations/alignment-row-keys.md`

### Reference (정보/사전)

- `docs/ko/reference/public-api.md`
- `docs/ko/reference/types.md`
- `docs/ko/reference/scanner.md`
- `docs/ko/reference/stores.md`
- `docs/ko/reference/compare-align.md`
- `docs/ko/reference/ops-and-vfs.md`

