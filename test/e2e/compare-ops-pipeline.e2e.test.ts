import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { FileExecutor } from '../../src/ops/FileExecutor.js';
import { ConflictPolicy, OpType } from '../../src/types/operations.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { joinVPath } from '../../src/vpath/normalize.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Scan → compare → build ops → execute.
// We sync files from a source root into a destination root using compare results.
describe('E2E compare-to-ops pipeline', () => {
  it('copies added and modified files from source to destination', async () => {
    const baseDir = createTempDir('e2e-pipeline-');
    const srcDir = path.join(baseDir, 'src');
    const dstDir = path.join(baseDir, 'dst');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(dstDir, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: prepare source and destination content.
      fs.mkdirSync(path.join(srcDir, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dstDir, 'data'), { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'data', 'file1.txt'), 'source-v2');
      fs.writeFileSync(path.join(srcDir, 'data', 'file2.txt'), 'only-in-source');
      fs.writeFileSync(path.join(dstDir, 'data', 'file1.txt'), 'dest-v1');

      // Step 2: create sqlite store and register roots.
      store = createSqliteStore(baseDir);
      const srcRoot = makeRoot('r:src', srcDir);
      const dstRoot = makeRoot('r:dst', dstDir);
      store.registerRoot(srcRoot);
      store.registerRoot(dstRoot);

      // Step 3: scan both roots into separate snapshots.
      const snapSrc = store.createSnapshot(srcRoot.rootId);
      const snapDst = store.createSnapshot(dstRoot.rootId);
      await scanAndPersist({ store, root: srcRoot, snapshotId: snapSrc.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });
      await scanAndPersist({ store, root: dstRoot, snapshotId: snapDst.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });

      // Step 4: compare (left=dst, right=src) to find what should be copied.
      const comparer = new DefaultComparer(store);
      const scope = { baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE };
      const diff = comparer.compare(snapDst.snapshotId, snapSrc.snapshotId, {
        mode: CompareMode.STRICT,
        scope,
        identity: {
          strategies: [
            { type: EvidenceType.VPATH, weight: 1 },
            { type: EvidenceType.SIZE, weight: 1 }
          ],
          conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
          thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
          casePolicy: 'SENSITIVE'
        },
        move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
        requireObservedCoverage: true
      });

      // Step 5: build a minimal operation plan from ADDED + MODIFIED entries.
      // For each entry, copy from src root to dst root, overwriting when needed.
      const ops = diff.entries
        .filter((entry) => entry.type === 'ADDED' || entry.type === 'MODIFIED')
        .filter((entry) => entry.right?.ref?.vpath && entry.path !== '/')
        .map((entry, idx) => {
          const dstVPath = joinVPath(scope.baseVPath as any, entry.path as any);
          return {
            opId: `op:${idx}`,
            type: OpType.COPY,
            src: entry.right?.ref,
            dst: { rootId: dstRoot.rootId, vpath: dstVPath },
            policy: { conflict: ConflictPolicy.OVERWRITE }
          };
        });

      const plan = {
        planId: 'plan:sync',
        createdAt: new Date().toISOString(),
        ops
      };

      // Step 6: execute the plan using a root resolver that knows both roots.
      const executor = new FileExecutor(
        { getRoot: (rootId: string) => (rootId === srcRoot.rootId ? srcRoot : dstRoot) },
        new ArchiveRegistry([new ZipArchiveReader()])
      );
      await executor.execute(plan, {
        onStarted: () => {},
        onOpStarted: () => {},
        onOpFinished: () => {},
        onError: () => {},
        onFinished: () => {}
      });

      // Step 7: verify destination now matches source for the synced files.
      expect(fs.readFileSync(path.join(dstDir, 'data', 'file1.txt'), 'utf8')).toBe('source-v2');
      expect(fs.readFileSync(path.join(dstDir, 'data', 'file2.txt'), 'utf8')).toBe('only-in-source');
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
