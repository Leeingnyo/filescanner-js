import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, createZip } from './helpers.js';

// E2E: Archive-aware comparison across snapshots.
// A uses a plain directory, B uses a zip archive with the same file, and C uses a zip
// archive with different contents. We compare A↔B (same) and A↔C (different).
describe('E2E archive-aware compare', () => {
  it('compares a directory to archives with same/different contents', async () => {
    const baseDir = createTempDir('e2e-archive-');
    // Create three roots under a shared temp base; each test still has its own temp dir.
    const dirA = path.join(baseDir, 'A');
    const dirB = path.join(baseDir, 'B');
    const dirC = path.join(baseDir, 'C');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirC, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // A: plain directory with a file.
      fs.mkdirSync(path.join(dirA, 'data'), { recursive: true });
      fs.writeFileSync(path.join(dirA, 'data', 'file.txt'), 'same');

      // B/C: archives containing the same path as A.
      await createZip(path.join(dirB, 'archive.zip'), [{ name: 'data/file.txt', content: 'same' }]);
      await createZip(path.join(dirC, 'archive.zip'), [{ name: 'data/file.txt', content: 'different-content' }]);

      store = createSqliteStore(baseDir);
      // Register each root separately so snapshots can be compared across roots.
      const rootA = makeRoot('r:A', dirA);
      const rootB = makeRoot('r:B', dirB);
      const rootC = makeRoot('r:C', dirC);
      store.registerRoot(rootA);
      store.registerRoot(rootB);
      store.registerRoot(rootC);

      const snapA = store.createSnapshot(rootA.rootId);
      const snapB = store.createSnapshot(rootB.rootId);
      const snapC = store.createSnapshot(rootC.rootId);

      // Include archive scanning so zip entries are materialized in snapshots.
      await scanAndPersist({ store, root: rootA, snapshotId: snapA.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });
      await scanAndPersist({ store, root: rootB, snapshotId: snapB.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });
      await scanAndPersist({ store, root: rootC, snapshotId: snapC.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });

      // We compare only a single node so directory entries do not affect the result.
      const comparer = new DefaultComparer(store);
      const options = {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/data/file.txt', mode: ScopeMode.SINGLE_NODE },
        identity: {
          // Match by VPATH + SIZE to detect content changes without relying on hashes.
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

      // Compare A (OS layer) against B/C (archive layer).
      const baseA = {
        rootId: rootA.rootId,
        layers: [{ kind: LayerKind.OS, rootId: rootA.rootId }],
        vpath: '/'
      };
      const baseB = {
        rootId: rootB.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootB.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
        ],
        vpath: '/'
      };
      const baseC = {
        rootId: rootC.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootC.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
        ],
        vpath: '/'
      };

      // A vs B should be equivalent for the single file.
      const same = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapB.snapshotId, baseB as any, options);
      expect(same.summary.modified).toBe(0);
      expect(same.summary.added).toBe(0);
      expect(same.summary.removed).toBe(0);

      // A vs C should show a modification for the file.
      const different = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapC.snapshotId, baseC as any, options);
      expect(different.summary.modified).toBeGreaterThan(0);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
