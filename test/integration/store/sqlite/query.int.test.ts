import { describe, expect, it } from 'vitest';
import { makeRoot, makeStore, makeObservedNode } from './helpers.js';
import { RunStatus, ScopeCompleteness, ScopeMode } from '../../../../src/types/scan.js';
import { NodeKind } from '../../../../src/types/enums.js';
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

describe('SqliteSnapshotStore queries', () => {
  it('lists children with name sorting and pagination', () => {
    const store = makeStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run = makeRun(root.rootId, 'run:1');
    const session = store.beginPatch(snapshot.snapshotId, run);
    session.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/b', name: 'b', runId: run.runId }),
      makeObservedNode({ rootId: root.rootId, vpath: '/A', name: 'A', runId: run.runId }),
      makeObservedNode({ rootId: root.rootId, vpath: '/c', name: 'c', runId: run.runId })
    ]);
    session.recordCoverage({
      runId: run.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session.commit();

    const parentRef = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/' };
    const list = store.listChildren(snapshot.snapshotId, parentRef, undefined, { limit: 2 });
    expect(list.nodes.map((node) => node.name)).toEqual(['A', 'b']);
    const next = store.listChildren(snapshot.snapshotId, parentRef, undefined, { limit: 2, cursor: list.nextCursor });
    expect(next.nodes.map((node) => node.name)).toEqual(['c']);
    store.close();
  });

  it('filters by vpathPrefix, size range and hash', () => {
    const store = makeStore();
    const root = makeRoot('r:2');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run = makeRun(root.rootId, 'run:1');
    const session = store.beginPatch(snapshot.snapshotId, run);
    session.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/Files/A.txt', name: 'A.txt', runId: run.runId, size: 10, hash: { algo: 'sha256', value: 'aaa' } }),
      makeObservedNode({ rootId: root.rootId, vpath: '/Files/B.txt', name: 'B.txt', runId: run.runId, size: 20, hash: { algo: 'sha256', value: 'bbb' } }),
      makeObservedNode({ rootId: root.rootId, vpath: '/Other/C.txt', name: 'C.txt', runId: run.runId, size: 30 })
    ]);
    session.recordCoverage({
      runId: run.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    session.commit();

    const byPrefix = store.queryNodes(snapshot.snapshotId, { filter: { vpathPrefix: '/files' } });
    expect(byPrefix.nodes.map((n) => n.name).sort()).toEqual(['A.txt', 'B.txt']);

    const bySize = store.rangeBySize(snapshot.snapshotId, 15, 30);
    expect(bySize.nodes.map((n) => n.name).sort()).toEqual(['B.txt', 'C.txt']);

    const byHash = store.findByHash(snapshot.snapshotId, 'sha256', 'aaa');
    expect(byHash.nodes.map((n) => n.name)).toEqual(['A.txt']);
    store.close();
  });
});
