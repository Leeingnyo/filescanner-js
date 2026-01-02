import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultAligner } from '../../src/align/DefaultAligner.js';
import { AlignKeyType } from '../../src/types/align.js';
import { CompareMode } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Align across three snapshots using real scans + sqlite persistence.
// A and B share one file, C is missing it; A alone has an extra file.
describe('E2E alignment', () => {
  it('aligns rows across snapshots and reports missing cells', async () => {
    const baseDir = createTempDir('e2e-align-');
    const dirA = path.join(baseDir, 'A');
    const dirB = path.join(baseDir, 'B');
    const dirC = path.join(baseDir, 'C');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(dirC, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: create minimal but distinct content across roots.
      fs.mkdirSync(path.join(dirA, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dirB, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dirC, 'data'), { recursive: true });
      fs.writeFileSync(path.join(dirA, 'data', 'shared.txt'), 'same');
      fs.writeFileSync(path.join(dirB, 'data', 'shared.txt'), 'same');
      fs.writeFileSync(path.join(dirA, 'data', 'only-a.txt'), 'only-a');

      // Step 2: create sqlite store and register roots.
      store = createSqliteStore(baseDir);
      const rootA = makeRoot('r:A', dirA);
      const rootB = makeRoot('r:B', dirB);
      const rootC = makeRoot('r:C', dirC);
      store.registerRoot(rootA);
      store.registerRoot(rootB);
      store.registerRoot(rootC);

      // Step 3: scan each root into its own snapshot.
      const snapA = store.createSnapshot(rootA.rootId);
      const snapB = store.createSnapshot(rootB.rootId);
      const snapC = store.createSnapshot(rootC.rootId);
      await scanAndPersist({ store, root: rootA, snapshotId: snapA.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });
      await scanAndPersist({ store, root: rootB, snapshotId: snapB.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });
      await scanAndPersist({ store, root: rootC, snapshotId: snapC.snapshotId, scopes: [{ baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE }], includeArchives: false });

      // Step 4: align by vpath across all snapshots.
      const aligner = new DefaultAligner(store);
      const result = aligner.align(
        [snapA.snapshotId, snapB.snapshotId, snapC.snapshotId],
        { baseVPath: '/data', mode: ScopeMode.FULL_SUBTREE },
        { type: AlignKeyType.VPATH },
        CompareMode.STRICT
      );

      // Step 5: verify the shared row exists with missing in C.
      const shared = result.rows.find((row) => row.displayKey === '/data/shared.txt');
      expect(shared).toBeTruthy();
      expect(shared?.cells[0].state).toBe('PRESENT');
      expect(shared?.cells[1].state).toBe('PRESENT');
      expect(shared?.cells[2].state).toBe('MISSING');

      // Step 6: verify the A-only row is missing in B/C.
      const onlyA = result.rows.find((row) => row.displayKey === '/data/only-a.txt');
      expect(onlyA).toBeTruthy();
      expect(onlyA?.cells[0].state).toBe('PRESENT');
      expect(onlyA?.cells[1].state).toBe('MISSING');
      expect(onlyA?.cells[2].state).toBe('MISSING');
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
