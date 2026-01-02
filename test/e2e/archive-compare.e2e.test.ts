import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, createZip } from './helpers.js';

// E2E: Archive-aware comparison across snapshots.
// A and B contain identical zip entries; C has the same zip name but different contents.
describe('E2E archive-aware compare', () => {
  it('treats identical archives as same and different archives as modified', async () => {
    const baseDir = createTempDir('e2e-archive-');
    const dirA = path.join(baseDir, 'A');
    const dirB = path.join(baseDir, 'B');
    const dirC = path.join(baseDir, 'C');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirC, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Create identical zip archives in A and B, and a different one in C.
      await createZip(path.join(dirA, 'archive.zip'), [{ name: 'data/file.txt', content: 'same' }]);
      await createZip(path.join(dirB, 'archive.zip'), [{ name: 'data/file.txt', content: 'same' }]);
      await createZip(path.join(dirC, 'archive.zip'), [{ name: 'data/file.txt', content: 'different-content' }]);

      store = createSqliteStore(baseDir);
      const rootA = makeRoot('r:A', dirA);
      const rootB = makeRoot('r:B', dirB);
      const rootC = makeRoot('r:C', dirC);
      store.registerRoot(rootA);
      store.registerRoot(rootB);
      store.registerRoot(rootC);

      const snapA = store.createSnapshot(rootA.rootId);
      const snapB = store.createSnapshot(rootB.rootId);
      const snapC = store.createSnapshot(rootC.rootId);

      // Include archive scanning so zip entries become part of the snapshot.
      await scanAndPersist({ store, root: rootA, snapshotId: snapA.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });
      await scanAndPersist({ store, root: rootB, snapshotId: snapB.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });
      await scanAndPersist({ store, root: rootC, snapshotId: snapC.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });

      const comparer = new DefaultComparer(store);
      const options = {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE },
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
      };

      // Compare inside the archive layer (archive root as the base).
      const baseA = {
        rootId: rootA.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootA.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
        ],
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

      const same = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapB.snapshotId, baseB as any, options);
      expect(same.summary.modified).toBe(0);
      expect(same.summary.added).toBe(0);
      expect(same.summary.removed).toBe(0);

      const different = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapC.snapshotId, baseC as any, options);
      const hasDiff = different.entries.some((entry) => entry.type !== 'NOT_COVERED' && entry.type !== 'UNKNOWN');
      expect(hasDiff).toBe(true);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
