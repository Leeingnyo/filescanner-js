import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Verify move detection across snapshots using real filesystem renames.
// This relies on POSIX inode identity, so we skip on Windows.
describe('E2E move detection', () => {
  const itPosix = process.platform === 'win32' ? it.skip : it;

  itPosix('detects a moved file between snapshots', async () => {
    const baseDir = createTempDir('e2e-move-');
    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: create a file we will rename later.
      // Keep content under /data to avoid the "/" prefix edge case for subtree queries.
      fs.mkdirSync(path.join(baseDir, 'data'), { recursive: true });
      fs.writeFileSync(path.join(baseDir, 'data', 'before.txt'), 'move-me');

      // Step 2: create a sqlite-backed store and register the root.
      store = createSqliteStore(baseDir);
      const root = makeRoot('r:move', baseDir, true);
      store.registerRoot(root);

      // Step 3: snapshot before the rename.
      const snapBefore = store.createSnapshot(root.rootId);
      await scanAndPersist({
        store,
        root,
        snapshotId: snapBefore.snapshotId,
        scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });

      // Step 4: rename the file in-place (inode stays the same).
      fs.renameSync(path.join(baseDir, 'data', 'before.txt'), path.join(baseDir, 'data', 'after.txt'));

      // Step 5: snapshot after the rename.
      const snapAfter = store.createSnapshot(root.rootId);
      await scanAndPersist({
        store,
        root,
        snapshotId: snapAfter.snapshotId,
        scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });

      // Step 6: compare with move detection enabled using OS_FILE_ID evidence.
      const comparer = new DefaultComparer(store);
      const result = comparer.compare(snapBefore.snapshotId, snapAfter.snapshotId, {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE },
        identity: {
          strategies: [{ type: EvidenceType.OS_FILE_ID, weight: 1 }],
          conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
          thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
          casePolicy: 'SENSITIVE'
        },
        move: { enabled: true, strategies: [EvidenceType.OS_FILE_ID], minConfidence: Confidence.POSSIBLE },
        requireObservedCoverage: true
      });

      // Confirm the move is reported (left: before.txt, right: after.txt).
      const move = result.entries.find((entry) => entry.type === 'MOVED');
      expect(move?.path).toBe('/data/after.txt');
      expect(move?.left?.ref.vpath).toBe('/data/before.txt');
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
