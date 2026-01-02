import { describe, expect, it } from 'vitest';
import { MemorySnapshotStore } from '../store/memory/MemorySnapshotStore.js';
import { makeObservedNode, makeRoot } from '../store/memory/memoryTestHelpers.js';
import { RunStatus, ScopeCompleteness, ScopeMode } from '../types/scan.js';
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
    s1.recordCoverage({
      runId: run1.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    s1.commit();

    const run2 = makeRun(root.rootId, 'run:2');
    const s2 = store.beginPatch(snap2.snapshotId, run2);
    s2.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run2.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/b.txt', name: 'b.txt', runId: run2.runId, identity: { dev: 1, inode: 2 }, size: 10 }),
      makeObservedNode({ rootId: root.rootId, vpath: '/same.txt', name: 'same.txt', runId: run2.runId, size: 7 })
    ]);
    s2.recordCoverage({
      runId: run2.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
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

  it('reports type changes and conflicts', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:4');
    store.registerRoot(root);
    const left = store.createSnapshot(root.rootId);
    const right = store.createSnapshot(root.rootId);

    const runLeft = makeRun(root.rootId, 'run:1');
    const sessionLeft = store.beginPatch(left.snapshotId, runLeft);
    sessionLeft.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runLeft.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/item', name: 'item', runId: runLeft.runId, kind: NodeKind.FILE, size: 1 }),
      makeObservedNode({ rootId: root.rootId, vpath: '/conflict', name: 'conflict', runId: runLeft.runId, kind: NodeKind.FILE, size: 10 })
    ]);
    sessionLeft.recordCoverage({
      runId: runLeft.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionLeft.commit();

    const runRight = makeRun(root.rootId, 'run:2');
    const sessionRight = store.beginPatch(right.snapshotId, runRight);
    sessionRight.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runRight.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/item', name: 'item', runId: runRight.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/conflict', name: 'conflict', runId: runRight.runId, kind: NodeKind.FILE, size: 20 })
    ]);
    sessionRight.recordCoverage({
      runId: runRight.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionRight.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(left.snapshotId, right.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [
          { type: EvidenceType.NAME, weight: 0.6 },
          { type: EvidenceType.SIZE, weight: 0.6 }
        ],
        conflictHandling: ConflictHandling.MARK_CONFLICT,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.5 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: false
    });

    const typeChanged = result.entries.find((e) => e.path === '/item');
    const conflict = result.entries.find((e) => e.path === '/conflict');
    expect(typeChanged?.type).toBe('TYPE_CHANGED');
    expect(conflict?.type).toBe('CONFLICT');
  });

  it('removes added/removed entries when moves are detected', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:5');
    store.registerRoot(root);
    const left = store.createSnapshot(root.rootId);
    const right = store.createSnapshot(root.rootId);

    const runLeft = makeRun(root.rootId, 'run:1');
    const sessionLeft = store.beginPatch(left.snapshotId, runLeft);
    sessionLeft.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runLeft.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/old.txt', name: 'old.txt', runId: runLeft.runId, identity: { dev: 1, inode: 2 } })
    ]);
    sessionLeft.recordCoverage({
      runId: runLeft.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionLeft.commit();

    const runRight = makeRun(root.rootId, 'run:2');
    const sessionRight = store.beginPatch(right.snapshotId, runRight);
    sessionRight.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runRight.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/new.txt', name: 'new.txt', runId: runRight.runId, identity: { dev: 1, inode: 2 } })
    ]);
    sessionRight.recordCoverage({
      runId: runRight.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionRight.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(left.snapshotId, right.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [{ type: EvidenceType.OS_FILE_ID, weight: 1 }],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: true, strategies: [EvidenceType.OS_FILE_ID], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: false
    });

    const types = result.entries.map((e) => e.type);
    expect(types).toContain('MOVED');
    expect(types).not.toContain('ADDED');
    expect(types).not.toContain('REMOVED');
  });

  it('returns NOT_COVERED when coverage is missing in STRICT mode', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:2');
    store.registerRoot(root);
    const left = store.createSnapshot(root.rootId);
    const right = store.createSnapshot(root.rootId);

    const run = makeRun(root.rootId, 'run:1');
    const sessionLeft = store.beginPatch(left.snapshotId, run);
    sessionLeft.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run.runId, kind: NodeKind.DIR })]);
    sessionLeft.recordCoverage({
      runId: run.runId,
      scopes: [{ scope: { baseVPath: '/other', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionLeft.commit();

    const sessionRight = store.beginPatch(right.snapshotId, run);
    sessionRight.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: run.runId, kind: NodeKind.DIR })]);
    sessionRight.recordCoverage({
      runId: run.runId,
      scopes: [{ scope: { baseVPath: '/other', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionRight.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(left.snapshotId, right.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [{ type: EvidenceType.VPATH, weight: 1 }],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: true
    });

    expect(result.entries[0].type).toBe('NOT_COVERED');
  });

  it('returns UNKNOWN instead of REMOVED when coverage is missing in LENIENT mode', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:3');
    store.registerRoot(root);
    const left = store.createSnapshot(root.rootId);
    const right = store.createSnapshot(root.rootId);

    const runLeft = makeRun(root.rootId, 'run:1');
    const sessionLeft = store.beginPatch(left.snapshotId, runLeft);
    sessionLeft.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runLeft.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/a.txt', name: 'a.txt', runId: runLeft.runId })
    ]);
    sessionLeft.recordCoverage({
      runId: runLeft.runId,
      scopes: [{ scope: { baseVPath: '/other', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionLeft.commit();

    const runRight = makeRun(root.rootId, 'run:2');
    const sessionRight = store.beginPatch(right.snapshotId, runRight);
    sessionRight.upsertNodes([makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runRight.runId, kind: NodeKind.DIR })]);
    sessionRight.recordCoverage({
      runId: runRight.runId,
      scopes: [{ scope: { baseVPath: '/other', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionRight.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(left.snapshotId, right.snapshotId, {
      mode: CompareMode.LENIENT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [{ type: EvidenceType.VPATH, weight: 1 }],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: false
    });

    const entry = result.entries.find((e) => e.path === '/a.txt');
    expect(entry?.type).toBe('UNKNOWN');
  });

  it('respects CHILDREN_ONLY scope when comparing', () => {
    const store = new MemorySnapshotStore();
    const root = makeRoot('r:6');
    store.registerRoot(root);
    const left = store.createSnapshot(root.rootId);
    const right = store.createSnapshot(root.rootId);

    const runLeft = makeRun(root.rootId, 'run:1');
    const sessionLeft = store.beginPatch(left.snapshotId, runLeft);
    sessionLeft.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runLeft.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir', name: 'dir', runId: runLeft.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir/file.txt', name: 'file.txt', runId: runLeft.runId }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir/sub/deep.txt', name: 'deep.txt', runId: runLeft.runId })
    ]);
    sessionLeft.recordCoverage({
      runId: runLeft.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionLeft.commit();

    const runRight = makeRun(root.rootId, 'run:2');
    const sessionRight = store.beginPatch(right.snapshotId, runRight);
    sessionRight.upsertNodes([
      makeObservedNode({ rootId: root.rootId, vpath: '/', name: '', runId: runRight.runId, kind: NodeKind.DIR }),
      makeObservedNode({ rootId: root.rootId, vpath: '/dir', name: 'dir', runId: runRight.runId, kind: NodeKind.DIR })
    ]);
    sessionRight.recordCoverage({
      runId: runRight.runId,
      scopes: [{ scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }, completeness: ScopeCompleteness.COMPLETE }]
    });
    sessionRight.commit();

    const comparer = new DefaultComparer(store);
    const result = comparer.compare(left.snapshotId, right.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/dir', mode: ScopeMode.CHILDREN_ONLY },
      identity: {
        strategies: [{ type: EvidenceType.VPATH, weight: 1 }],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
        casePolicy: 'SENSITIVE'
      },
      move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
      requireObservedCoverage: false
    });

    const removed = result.entries.find((e) => e.path === '/file.txt');
    const deep = result.entries.find((e) => e.path === '/sub/deep.txt');
    expect(removed?.type).toBe('REMOVED');
    expect(deep).toBeUndefined();
  });
});
