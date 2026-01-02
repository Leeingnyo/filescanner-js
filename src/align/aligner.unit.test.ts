import { describe, expect, it } from 'vitest';
import { MemorySnapshotStore } from '../store/memory/MemorySnapshotStore.js';
import { makeObservedNode, makeRoot } from '../store/memory/memoryTestHelpers.js';
import { RunStatus, ScopeCompleteness, ScopeMode } from '../types/scan.js';
import { DefaultAligner } from './DefaultAligner.js';
import { AlignKeyType } from '../types/align.js';
import { CompareMode } from '../types/compare.js';
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

describe('DefaultAligner', () => {
  it('builds alignment rows by vpath', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:1');
    store.registerRoot(root);
    const s1 = store.createSnapshot(root.rootId);
    const s2 = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const p1 = store.beginPatch(s1.snapshotId, run1);
    p1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a.txt', name: 'a.txt', runId: run1.runId })
    ]);
    p1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    p1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const p2 = store.beginPatch(s2.snapshotId, run2);
    p2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run2.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/b.txt', name: 'b.txt', runId: run2.runId })
    ]);
    p2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    p2.commit();

    const aligner = new DefaultAligner(store);
    const result = aligner.align([s1.snapshotId, s2.snapshotId], { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, { type: AlignKeyType.VPATH }, CompareMode.STRICT);

    const rowKeys = result.rows.map((r) => r.displayKey).sort();
    expect(rowKeys).toContain('/a.txt');
    expect(rowKeys).toContain('/b.txt');
  });

  it('marks cells as not covered when coverage is missing', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:2');
    store.registerRoot(root);
    const s1 = store.createSnapshot(root.rootId);
    const s2 = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const p1 = store.beginPatch(s1.snapshotId, run1);
    p1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a.txt', name: 'a.txt', runId: run1.runId })
    ]);
    p1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    p1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const p2 = store.beginPatch(s2.snapshotId, run2);
    p2.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run2.runId, kind: NodeKind.DIR })]);
    p2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.PARTIAL }]
    });
    p2.commit();

    const aligner = new DefaultAligner(store);
    const result = aligner.align([s1.snapshotId, s2.snapshotId], { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, { type: AlignKeyType.VPATH }, CompareMode.STRICT);
    const row = result.rows.find((r) => r.displayKey === '/a.txt');
    expect(row?.cells[1].state).toBe('NOT_COVERED');
  });

  it('collects children-only and single-node scopes correctly', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:3');
    store.registerRoot(root);
    const s1 = store.createSnapshot(root.rootId);

    const run1 = makeRun(root.rootId, 'run:1');
    const p1 = store.beginPatch(s1.snapshotId, run1);
    p1.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir', name: 'dir', runId: run1.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir/child.txt', name: 'child.txt', runId: run1.runId }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir/sub/deep.txt', name: 'deep.txt', runId: run1.runId })
    ]);
    p1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    p1.commit();

    const aligner = new DefaultAligner(store);
    const children = aligner.align([s1.snapshotId], { baseVPath: '/dir', mode: ScopeMode.CHILDREN_ONLY }, { type: AlignKeyType.VPATH }, CompareMode.STRICT);
    const childKeys = children.rows.map((r) => r.displayKey).sort();
    expect(childKeys).toContain('/dir/child.txt');
    expect(childKeys).not.toContain('/dir/sub/deep.txt');

    const single = aligner.align([s1.snapshotId], { baseVPath: '/dir', mode: ScopeMode.SINGLE_NODE }, { type: AlignKeyType.VPATH }, CompareMode.STRICT);
    expect(single.rows.map((r) => r.displayKey)).toEqual(['/dir']);
  });
});
