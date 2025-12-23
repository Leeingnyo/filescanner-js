import { describe, expect, it } from 'vitest';
import { makeRoot, makeStore, makeObservedNode } from './helpers.js';
import { RunStatus, ScopeMode } from '../../../src/types/scan.js';
import { NodeKind } from '../../../src/types/enums.js';
import { LayerKind } from '../../../src/types/layers.js';

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
    session1.recordCoverage({ runId: run1.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
    session1.commit();

    const nodeA = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a.txt' })!;
    const firstSeen = nodeA.firstSeenAt;

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/b.txt', name: 'b.txt', runId: run2.runId, identity: { dev: 1, inode: 2 } })
    ]);
    session2.recordCoverage({ runId: run2.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
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
    session1.recordCoverage({ runId: run1.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
    session1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const session2 = store.beginPatch(snapshot.snapshotId, run2);
    session2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run2.runId, kind: NodeKind.DIR })
    ]);
    session2.recordCoverage({ runId: run2.runId, scopes: [{ baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY }] });
    session2.commit();

    const file = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a/file.txt' }, true)!;
    const deep = store.getNodeByRef(snapshot.snapshotId, { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/a/sub/deep.txt' }, true)!;
    expect(file.isDeleted).toBe(true);
    expect(deep.isDeleted).toBe(false);
    store.close();
  });
});
