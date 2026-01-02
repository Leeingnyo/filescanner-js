import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Compare three directories (A/B/C) using real scans + sqlite persistence.
// A and B are identical; C has a size change to ensure a diff is detected.
describe('E2E compare A/B/C', () => {
  it('treats A and B as same, and C as different', async () => {
    const baseDir = createTempDir('e2e-compare-');
    // Three independent roots to compare.
    const dirA = path.join(baseDir, 'A');
    const dirB = path.join(baseDir, 'B');
    const dirC = path.join(baseDir, 'C');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirC, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Minimal but representative content: same file size in A/B, larger in C.
      // Place content under a subdirectory so FULL_SUBTREE queries avoid the "/" prefix edge case.
      fs.mkdirSync(path.join(dirA, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dirB, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dirC, 'data'), { recursive: true });
      fs.writeFileSync(path.join(dirA, 'data', 'file.txt'), 'same-content');
      fs.writeFileSync(path.join(dirB, 'data', 'file.txt'), 'same-content');
      fs.writeFileSync(path.join(dirC, 'data', 'file.txt'), 'different-content-here');

      // Create a persistent store so we exercise the sqlite-backed flow.
      store = createSqliteStore(baseDir);
      const rootA = makeRoot('r:A', dirA);
      const rootB = makeRoot('r:B', dirB);
      const rootC = makeRoot('r:C', dirC);
      store.registerRoot(rootA);
      store.registerRoot(rootB);
      store.registerRoot(rootC);

      // One snapshot per root, each populated by a scan.
      const snapA = store.createSnapshot(rootA.rootId);
      const snapB = store.createSnapshot(rootB.rootId);
      const snapC = store.createSnapshot(rootC.rootId);

      // Full scans for all three snapshots (complete coverage).
      await scanAndPersist({ store, root: rootA, snapshotId: snapA.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });
      await scanAndPersist({ store, root: rootB, snapshotId: snapB.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });
      await scanAndPersist({ store, root: rootC, snapshotId: snapC.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });

      // Compare using VPATH + SIZE so same content matches and size changes are detected.
      const comparer = new DefaultComparer(store);
      const options = {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE },
        identity: {
          // Use VPATH + SIZE to keep directories stable while still catching size changes.
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
      };

      // A vs B should have no diffs.
      const resultAB = comparer.compare(snapA.snapshotId, snapB.snapshotId, options);
      expect(resultAB.summary.added).toBe(0);
      expect(resultAB.summary.removed).toBe(0);
      expect(resultAB.summary.modified).toBe(0);
      expect(resultAB.summary.moved).toBe(0);

      // A vs C should contain at least one diff (modified by size change).
      const resultAC = comparer.compare(snapA.snapshotId, snapC.snapshotId, options);
      const hasDiff = resultAC.entries.some((entry) => entry.type !== 'NOT_COVERED' && entry.type !== 'UNKNOWN');
      expect(hasDiff).toBe(true);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
