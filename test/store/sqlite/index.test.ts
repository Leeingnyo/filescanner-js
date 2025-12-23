import { describe, expect, it } from 'vitest';
import { makeRoot, makeStore, makeObservedNode } from './helpers.js';
import { RunStatus, ScopeMode } from '../../../src/types/scan.js';
import { NodeKind } from '../../../src/types/enums.js';

function makeRun(rootId: string, runId: string) {
  return {
    runId,
    rootId,
    startedAt: new Date(1_700_000_000_000).toISOString(),
    requestedScopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
    status: RunStatus.RUNNING
  };
}

describe('SqliteSnapshotStore indexes', () => {
  it('finds by entity key and os identity', () => {
    const store = makeStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);

    const run = makeRun(root.rootId, 'run:1');
    const session = store.beginPatch(snapshot.snapshotId, run);
    session.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a', name: 'a', runId: run.runId, identity: { dev: 7, inode: 8 } }),
      makeObservedNode({ rootId: root.rootId, vpath: '/b', name: 'b', runId: run.runId, identity: { dev: 7, inode: 9 } })
    ]);
    session.recordCoverage({ runId: run.runId, scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }] });
    session.commit();

    const byIdentity = store.findByOsIdentity(snapshot.snapshotId, 'posix:7:8');
    expect(byIdentity.nodes.map((n) => n.name)).toEqual(['a']);

    const entityKey = byIdentity.nodes[0].entityKey;
    const byEntity = store.findByEntityKey(snapshot.snapshotId, entityKey);
    expect(byEntity.nodes.map((n) => n.name)).toEqual(['a']);
    store.close();
  });
});
