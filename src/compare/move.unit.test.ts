import { describe, expect, it } from 'vitest';
import { detectMoves } from './move.js';
import { EvidenceType, Confidence, ConflictHandling, type IdentityPolicy, type MovePolicy } from '../types/compare.js';
import { CasePolicy, IdentityPlatform, NodeKind } from '../types/enums.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import { LayerKind } from '../types/layers.js';

function makeNode(nodeId: string, vpath: string, size = 1): NodeMeta {
  return {
    nodeId,
    ref: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: vpath as any },
    kind: NodeKind.FILE,
    name: vpath.split('/').pop() ?? '',
    size,
    identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
    entityKey: `path:r:1:${vpath}`,
    firstSeenAt: new Date(1_700_000_000_000).toISOString(),
    isDeleted: false,
    hashes: {},
    extras: {},
    observedInRunId: 'run:1',
    lastObservedAt: new Date(1_700_000_000_000).toISOString(),
    errors: []
  };
}

describe('detectMoves', () => {
  it('uses deterministic greedy pairing with canonical tie-breakers', () => {
    const leftOnly = [makeNode('n:1', '/a.txt'), makeNode('n:2', '/b.txt')];
    const rightOnly = [makeNode('n:3', '/c.txt'), makeNode('n:4', '/d.txt')];

    const identity: IdentityPolicy = {
      strategies: [{ type: EvidenceType.SIZE, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const move: MovePolicy = { enabled: true, strategies: [EvidenceType.SIZE], minConfidence: Confidence.POSSIBLE };

    const moves = detectMoves(leftOnly, rightOnly, identity, move, CasePolicy.SENSITIVE);
    expect(moves).toHaveLength(2);
    expect(moves[0].left.ref.vpath).toBe('/a.txt');
    expect(moves[0].right.ref.vpath).toBe('/c.txt');
    expect(moves[1].left.ref.vpath).toBe('/b.txt');
    expect(moves[1].right.ref.vpath).toBe('/d.txt');
  });

  it('returns empty when move detection is disabled', () => {
    const identity: IdentityPolicy = {
      strategies: [{ type: EvidenceType.SIZE, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const move: MovePolicy = { enabled: false, strategies: [EvidenceType.SIZE], minConfidence: Confidence.POSSIBLE };
    const moves = detectMoves([makeNode('n:1', '/a.txt')], [makeNode('n:2', '/b.txt')], identity, move, CasePolicy.SENSITIVE);
    expect(moves).toHaveLength(0);
  });

  it('adds fallback strategies when move policies request them', () => {
    const leftOnly = [makeNode('n:1', '/a.txt', 42)];
    const rightOnly = [makeNode('n:2', '/b.txt', 42)];
    const identity: IdentityPolicy = {
      strategies: [{ type: EvidenceType.VPATH, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const move: MovePolicy = { enabled: true, strategies: [EvidenceType.SIZE], minConfidence: Confidence.POSSIBLE };
    const moves = detectMoves(leftOnly, rightOnly, identity, move, CasePolicy.SENSITIVE);
    expect(moves).toHaveLength(1);
    expect(moves[0].left.ref.vpath).toBe('/a.txt');
    expect(moves[0].right.ref.vpath).toBe('/b.txt');
  });
});
