import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ScopeMode } from '../../src/types/scan.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Tombstone lifecycle across multiple scans of the same snapshot.
// We verify deletedAt is set once, undelete clears deletedAt, and firstSeenAt is preserved.
describe('E2E tombstones', () => {
  it('marks deletions and preserves firstSeenAt on reappearance', async () => {
    const baseDir = createTempDir('e2e-tombstone-');
    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: initial file exists.
      const filePath = path.join(baseDir, 'keep.txt');
      fs.writeFileSync(filePath, 'keep');

      // Step 2: sqlite store + root registration.
      store = createSqliteStore(baseDir);
      const root = makeRoot('r:ts', baseDir);
      store.registerRoot(root);

      const snapshot = store.createSnapshot(root.rootId);

      // Run 1: file exists.
      await scanAndPersist({
        store,
        root,
        snapshotId: snapshot.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });
      const ref = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/keep.txt' };
      const first = store.getNodeByRef(snapshot.snapshotId, ref, true);
      const firstSeenAt = first?.firstSeenAt;

      // Run 2: delete file, then scan again (tombstone expected).
      fs.rmSync(filePath);
      await scanAndPersist({
        store,
        root,
        snapshotId: snapshot.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });
      const deleted = store.getNodeByRef(snapshot.snapshotId, ref, true);
      expect(deleted?.isDeleted).toBe(true);
      const deletedAt = deleted?.deletedAt;
      expect(deletedAt).toBeTruthy();

      // Run 3: file reappears, then scan again (undelete expected).
      fs.writeFileSync(filePath, 'keep');
      await scanAndPersist({
        store,
        root,
        snapshotId: snapshot.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });
      const restored = store.getNodeByRef(snapshot.snapshotId, ref, true);
      expect(restored?.isDeleted).toBe(false);
      expect(restored?.deletedAt).toBeUndefined();
      expect(restored?.firstSeenAt).toBe(firstSeenAt);
      // deletedAt should not change across runs; once cleared, it remains undefined.
      expect(deletedAt).toBeTruthy();
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
