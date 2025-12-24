# 튜토리얼: 빠른 시작 (scan → snapshot)

가장 작은 end-to-end 흐름을 보여줍니다.

1) 루트 등록
2) 스냅샷 생성
3) 스캔하면서 `ObservedNode` 배치를 스트리밍으로 받기
4) `PatchSession`으로 저장하고 coverage를 기록한 뒤 커밋

## 1) 준비

```ts
import { ArchiveRegistry, ZipArchiveReader, FileSystemScanner, MemorySnapshotStore } from 'filescanner';
import { CasePolicy, OsKind } from 'filescanner';

const store = new MemorySnapshotStore();

const root = store.registerRoot({
  rootId: 'r:1',
  // spec.md의 정규화 규칙을 따라야 합니다 (posixpath:/..., winpath:C:\...).
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

## 2) 스캔 실행하고 스냅샷에 반영하기

`FileSystemScanner.startScan()`은 콜백 기반입니다. `onRunFinished`가 호출될 때까지 기다리는 Promise를 만듭니다.

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
      // 앱에 맞게 로그/집계하세요.
      // 참고: 스펙상 “특정 NodeRef에 귀속 가능한 에러”는 해당 노드의 errors에도 포함되는 것이 기대됩니다.
      void error;
    },
    onRunFinished(run: any, coverage: any) {
      try {
        session?.recordCoverage(coverage);
        session?.commit();
        if (run.status !== RunStatus.FINISHED) {
          throw new Error(`스캔이 정상 종료되지 않음: ${run.status}`);
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

## 3) 결과 확인

```ts
const updated = store.getSnapshot(snapshot.snapshotId);
console.log(updated.stats); // { nodeCount, dirCount, fileCount }

import { LayerKind } from 'filescanner';

const rootRef = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/' };
const children = store.listChildren(snapshot.snapshotId, rootRef).nodes;
```

## 참고 (현재 구현의 특징)

- 현재 `FileSystemScanner`는 OS 파일 ID나 컨텐츠 해시를 계산하지 않습니다(대부분 `UNKNOWN`).
- `concurrency` 필드는 API에는 있지만 현재 스캐너 구현에서 사용되지 않습니다.
