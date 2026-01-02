import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist } from './helpers.js';

// E2E: Partial coverage should block comparisons when coverage is required.
// We cancel a scan to force PARTIAL coverage, then compare with requireObservedCoverage=true.
describe('E2E partial coverage behavior', () => {
  it('returns NOT_COVERED when coverage is partial', async () => {
    const baseDir = createTempDir('e2e-partial-');
    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      fs.writeFileSync(path.join(baseDir, 'file.txt'), 'data');

      store = createSqliteStore(baseDir);
      const root = makeRoot('r:partial', baseDir);
      store.registerRoot(root);

      const snapshotPartial = store.createSnapshot(root.rootId);
      await scanAndPersist({
        store,
        root,
        snapshotId: snapshotPartial.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false,
        cancel: true
      });

      const snapshotFull = store.createSnapshot(root.rootId);
      await scanAndPersist({
        store,
        root,
        snapshotId: snapshotFull.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false
      });

      const comparer = new DefaultComparer(store);
      const result = comparer.compare(snapshotPartial.snapshotId, snapshotFull.snapshotId, {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
        identity: {
          strategies: [{ type: EvidenceType.SIZE, weight: 1 }],
          conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
          thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
          casePolicy: 'SENSITIVE'
        },
        move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
        requireObservedCoverage: true
      });

      expect(result.summary.notCovered).toBe(1);
      expect(result.entries[0].type).toBe('NOT_COVERED');
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
