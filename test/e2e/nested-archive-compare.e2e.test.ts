import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yazl from 'yazl';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, createZip, makePolicy } from './helpers.js';

// E2E: Compare nested archives (outer.zip contains inner.zip).
// A and B have identical nested content; C has different nested content.
describe('E2E nested archive compare', () => {
  it('compares nested archive content correctly', async () => {
    const baseDir = createTempDir('e2e-nested-archive-');
    const dirA = path.join(baseDir, 'A');
    const dirB = path.join(baseDir, 'B');
    const dirC = path.join(baseDir, 'C');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirC, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: create inner zips (A/B same, C different).
      const innerA = path.join(baseDir, 'innerA.zip');
      const innerB = path.join(baseDir, 'innerB.zip');
      const innerC = path.join(baseDir, 'innerC.zip');
      await createZip(innerA, [{ name: 'data/file.txt', content: 'same' }]);
      await createZip(innerB, [{ name: 'data/file.txt', content: 'same' }]);
      await createZip(innerC, [{ name: 'data/file.txt', content: 'different' }]);
      const bufA = fs.readFileSync(innerA);
      const bufB = fs.readFileSync(innerB);
      const bufC = fs.readFileSync(innerC);

      // Step 2: embed inner zips into outer zip files for each root.
      const outerA = new yazl.ZipFile();
      outerA.addBuffer(bufA, 'inner.zip');
      outerA.end();
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(path.join(dirA, 'outer.zip'));
        outerA.outputStream.pipe(out);
        out.on('close', () => resolve());
        out.on('error', reject);
      });

      const outerB = new yazl.ZipFile();
      outerB.addBuffer(bufB, 'inner.zip');
      outerB.end();
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(path.join(dirB, 'outer.zip'));
        outerB.outputStream.pipe(out);
        out.on('close', () => resolve());
        out.on('error', reject);
      });

      const outerC = new yazl.ZipFile();
      outerC.addBuffer(bufC, 'inner.zip');
      outerC.end();
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(path.join(dirC, 'outer.zip'));
        outerC.outputStream.pipe(out);
        out.on('close', () => resolve());
        out.on('error', reject);
      });

      // Step 3: create sqlite store and register roots.
      store = createSqliteStore(baseDir);
      const rootA = makeRoot('r:A', dirA);
      const rootB = makeRoot('r:B', dirB);
      const rootC = makeRoot('r:C', dirC);
      store.registerRoot(rootA);
      store.registerRoot(rootB);
      store.registerRoot(rootC);

      // Step 4: scan with archive support and enough nesting depth.
      const policy = { ...makePolicy(true), archivePolicy: { ...makePolicy(true).archivePolicy, maxNesting: 3 } };
      const snapA = store.createSnapshot(rootA.rootId);
      const snapB = store.createSnapshot(rootB.rootId);
      const snapC = store.createSnapshot(rootC.rootId);
      await scanAndPersist({ store, root: rootA, snapshotId: snapA.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true, policy });
      await scanAndPersist({ store, root: rootB, snapshotId: snapB.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true, policy });
      await scanAndPersist({ store, root: rootC, snapshotId: snapC.snapshotId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true, policy });

      // Step 5: compare nested archive layers at a single file path.
      const comparer = new DefaultComparer(store);
      const options = {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/data/file.txt', mode: ScopeMode.SINGLE_NODE },
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

      const baseA = {
        rootId: rootA.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootA.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/outer.zip' },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/inner.zip' }
        ],
        vpath: '/'
      };
      const baseB = {
        rootId: rootB.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootB.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/outer.zip' },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/inner.zip' }
        ],
        vpath: '/'
      };
      const baseC = {
        rootId: rootC.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootC.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/outer.zip' },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/inner.zip' }
        ],
        vpath: '/'
      };

      const same = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapB.snapshotId, baseB as any, options);
      expect(same.summary.modified).toBe(0);
      expect(same.summary.added).toBe(0);
      expect(same.summary.removed).toBe(0);

      const different = comparer.compareSubtree(snapA.snapshotId, baseA as any, snapC.snapshotId, baseC as any, options);
      expect(different.summary.modified).toBeGreaterThan(0);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
