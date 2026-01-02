import { describe, expect, it } from 'vitest';
import { makeRoot, makeStore, makeObservedNode } from './helpers.js';
import { RunStatus, ScopeCompleteness, ScopeMode } from '../../../../src/types/scan.js';
import { ErrorCode, ErrorStage, NodeKind } from '../../../../src/types/enums.js';
import type { NodeError } from '../../../../src/types/error.js';
import { LayerKind } from '../../../../src/types/layers.js';

function makeRun(rootId: string, runId: string) {
  return {
    runId,
    rootId,
    startedAt: new Date(1_700_000_000_000).toISOString(),
    requestedScopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
    status: RunStatus.RUNNING
  };
}

describe('SqliteSnapshotStore patching', () => {
  it('preserves firstSeenAt across moves and deletes old path', () => {
    const store = makeStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const session1 = store.beginPatch(snapshot.snapshotId, run1);
    session1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a.txt', name: 'a.txt', runId: run1.runId, identity: { dev: 1, inode: 2 } })
    ]);
    session1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session1.commit();

    const nodeA = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a.txt' })!;
    const firstSeen = nodeA.firstSeenAt;

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/b.txt', name: 'b.txt', runId: run2.runId, identity: { dev: 1, inode: 2 } })
    ]);
    session2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session2.commit();

    const nodeB = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/b.txt' })!;
    expect(nodeB.firstSeenAt).toBe(firstSeen);
    const tombstone = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a.txt' }, true)!;
    expect(tombstone.isDeleted).toBe(true);
    store.close();
  });

  it('reconciles only immediate children for CHILDREN_ONLY', () => {
    const store = makeStore();
    const root = makeRoot('r:2');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const session1 = store.beginPatch(snapshot.snapshotId, run1);
    session1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a/file.txt', name: 'file.txt', runId: run1.runId }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a/sub', name: 'sub', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a/sub/deep.txt', name: 'deep.txt', runId: run1.runId })
    ]);
    session1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run2.runId, kind: NodeKind.DIR })
    ]);
    session2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session2.commit();

    const file = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a/file.txt' }, true)!;
    const deep = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a/sub/deep.txt' }, true)!;
    expect(file.isDeleted).toBe(true);
    expect(deep.isDeleted).toBe(false);
    store.close();
  });

  it('skips deletion reconciliation for PARTIAL coverage', () => {
    const store = makeStore();
    const root = makeRoot('r:3');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const session1 = store.beginPatch(snapshot.snapshotId, run1);
    session1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/keep.txt', name: 'keep.txt', runId: run1.runId })
    ]);
    session1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([]);
    session2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.PARTIAL }]
    });
    session2.commit();

    const node = store.getNodeByRef(
      snapshot.snapshotId,
      { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/keep.txt' },
      true
    )!;
    expect(node.isDeleted).toBe(false);
    store.close();
  });

  it('keeps deletedAt stable and undeletes with firstSeenAt preserved', () => {
    const store = makeStore();
    const root = makeRoot('r:4');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const session1 = store.beginPatch(snapshot.snapshotId, run1);
    session1.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run1.runId })]);
    session1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session1.commit();
    const initial = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a' })!;

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([]);
    session2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session2.commit();
    const deleted = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a' }, true)!;
    const deletedAt = deleted.deletedAt;

    const run3 = makeRun(root.rootId, 'run:3');
    const session3 = store.beginPatch(snapshot.snapshotId, run3);
    session3.upsertNodes([]);
    session3.recordCoverage({
      runId: run3.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session3.commit();
    const deletedAgain = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a' }, true)!;
    expect(deletedAgain.deletedAt).toBe(deletedAt);

    const run4 = makeRun(root.rootId, 'run:4');
    const session4 = store.beginPatch(snapshot.snapshotId, run4);
    session4.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run4.runId })]);
    session4.recordCoverage({
      runId: run4.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session4.commit();
    const undeleted = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a' }, true)!;
    expect(undeleted.isDeleted).toBe(false);
    expect(undeleted.deletedAt).toBeUndefined();
    expect(undeleted.firstSeenAt).toBe(initial.firstSeenAt);
    store.close();
  });

  it('persists coverage completeness and errors in snapshot', () => {
    const store = makeStore();
    const root = makeRoot('r:5');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run = makeRun(root.rootId, 'run:1');
    const session = store.beginPatch(snapshot.snapshotId, run);
    const error: NodeError = {
      code: ErrorCode.IO_ERROR,
      stage: ErrorStage.LIST,
      message: 'failed',
      retryable: true,
      at: new Date(1_700_000_000_000).toISOString()
    };
    session.recordCoverage({
      runId: run.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.PARTIAL, errors: [error] }]
    });
    session.commit();

    const updated = store.getSnapshot(snapshot.snapshotId);
    expect(updated.lastCoverage.scopes[0].completeness).toBe(ScopeCompleteness.PARTIAL);
    expect(updated.lastCoverage.scopes[0].errors?.[0].code).toBe(ErrorCode.IO_ERROR);
    store.close();
  });
});
