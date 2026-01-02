import { describe, expect, it } from 'vitest';
import { MemorySnapshotStore } from '../store/memory/MemorySnapshotStore.js';
import { makeObservedNode, makeRoot } from '../store/memory/memoryTestHelpers.js';
import { RunStatus, ScopeMode } from '../types/scan.js';
import { DefaultComparer } from './DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../types/compare.js';
import { NodeKind } from '../types/enums.js';

function makeRun(rootId: string, runId: string) {
  return {
    runId,
    rootId,
    startedAt: new Date(1_700_000_000_000).toISOString(),
    requestedScopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
    status: RunStatus.RUNNING
  };
}

describe('DefaultComparer', () => {
  it('detects moved and modified nodes', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const snap1 = store.createSnapshot(root.rootId);
    const snap2 = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const s1 = store.beginPatch(snap1.snapshotId, run1);
    s1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a.txt', name: 'a.txt', runId: run1.runId, identity: { dev: 1, inode: 2 }, size: 10 }),
      makeObservedNode({ rootId: root.rootId, vpath: '/same.txt', name: 'same.txt', runId: run1.runId, size: 5 })
    ]);
    s1.recordCoverage({ runId: run1.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
    s1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const s2 = store.beginPatch(snap2.snapshotId, run2);
    s2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run2.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/b.txt', name: 'b.txt', runId: run2.runId, identity: { dev: 1, inode: 2 }, size: 10 }),
      makeObservedNode({ rootId: root.rootId, vpath: '/same.txt', name: 'same.txt', runId: run2.runId, size: 7 })
    ]);
    s2.recordCoverage({ runId: run2.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
    s2.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(snap1.snapshotId, snap2.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [
          { type: EvidenceType.OS_FILE_ID, weight: 1 },
          { type: EvidenceType.SIZE, weight: 0.1 }
        ],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: true, strategies: [EvidenceType.OS_FILE_ID], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: false
    });

    const types = result.entries.map((e) => e.type);
    expect(types).toContain('MOVED');
    expect(types).toContain('MODIFIED');
  });
});
