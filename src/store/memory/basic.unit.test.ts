import { describe, expect, it } from 'vitest';
import { makeRoot, makeStore } from './memoryTestHelpers.js';
import { RunStatus, ScopeMode } from '../../types/scan.js';

function makeRun(rootId: string, runId = 'run:1') {
  return {
    runId,
    rootId,
    startedAt: new Date(1_700_000_000_000).toISOString(),
    requestedScopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
    status: RunStatus.RUNNING
  };
}

describe('MemorySnapshotStore basics', () => {
  it('registers roots and deduplicates by rootKey', () => {
    const store = makeStore();
    const root = makeRoot('r:1');
    const registered = store.registerRoot(root);
    const again = store.registerRoot(root);
    expect(registered.rootId).toBe('r:1');
    expect(again).toBe(registered);
    expect(store.getRoot('r:1').rootKey).toBe(root.rootKey);
  });

  it('creates snapshots and requires coverage on commit', () => {
    const store = makeStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const snapshot = store.createSnapshot(root.rootId);
    const run = makeRun(root.rootId);
    const session = store.beginPatch(snapshot.snapshotId, run);
    expect(() => session.commit()).toThrow('Coverage');
  });
});
