import { describe, expect, it } from 'vitest';
import { matchNodes } from './match.js';
import { EvidenceType, Confidence, ConflictHandling, type IdentityPolicy } from '../types/compare.js';
import { CasePolicy, IdentityPlatform, NodeKind } from '../types/enums.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import { LayerKind } from '../types/layers.js';
import { HashStatus } from '../types/enums.js';

function makeNode(overrides: Partial<NodeMeta>): NodeMeta {
  return {
    nodeId: 'n:1',
    ref: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/a' },
    kind: NodeKind.FILE,
    name: 'a',
    identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
    entityKey: 'e:1',
    firstSeenAt: new Date(1_700_000_000_000).toISOString(),
    isDeleted: false,
    hashes: {},
    extras: {},
    observedInRunId: 'run:1',
    lastObservedAt: new Date(1_700_000_000_000).toISOString(),
    errors: [],
    ...overrides
  };
}

describe('matchNodes', () => {
  it('reports missing values for OS_FILE_ID', () => {
    const left = makeNode({});
    const right = makeNode({ identity: { platform: IdentityPlatform.POSIX, posix: { dev: 1, inode: 2 }, isAvailable: true } });
    const policy: IdentityPolicy = {
      strategies: [{ type: EvidenceType.OS_FILE_ID, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.SENSITIVE);
    expect(result.evidence[0].outcome).toBe('MISSING_LEFT');
  });

  it('treats content hash mismatch as DIFFERENT when weight is strong', () => {
    const left = makeNode({ hashes: { sha256: { algo: 'sha256', value: 'aaa', status: HashStatus.PRESENT } } });
    const right = makeNode({ hashes: { sha256: { algo: 'sha256', value: 'bbb', status: HashStatus.PRESENT } } });
    const policy: IdentityPolicy = {
      strategies: [{ type: EvidenceType.CONTENT_HASH, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.SENSITIVE);
    expect(result.verdict).toBe('DIFFERENT');
    expect(result.confidence).toBe(Confidence.CERTAIN);
  });

  it('marks conflicts when match and mismatch are both strong', () => {
    const left = makeNode({ name: 'same', size: 10 });
    const right = makeNode({ name: 'same', size: 20 });
    const policy: IdentityPolicy = {
      strategies: [
        { type: EvidenceType.NAME, weight: 0.6 },
        { type: EvidenceType.SIZE, weight: 0.6 }
      ],
      conflictHandling: ConflictHandling.MARK_CONFLICT,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.5 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.SENSITIVE);
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.confidence).toBe(Confidence.POSSIBLE);
  });

  it('applies case-insensitive comparison for names', () => {
    const left = makeNode({ name: 'A' });
    const right = makeNode({ name: 'a' });
    const policy: IdentityPolicy = {
      strategies: [{ type: EvidenceType.NAME, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.INSENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.INSENSITIVE);
    expect(result.verdict).toBe('SAME');
  });

  it('returns DIFFERENT when mismatch score exceeds threshold', () => {
    const left = makeNode({ size: 10 });
    const right = makeNode({ size: 12 });
    const policy: IdentityPolicy = {
      strategies: [{ type: EvidenceType.SIZE, weight: 1 }],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.8, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.SENSITIVE);
    expect(result.verdict).toBe('DIFFERENT');
    expect(result.confidence).toBe(Confidence.CERTAIN);
  });

  it('returns POSSIBLY_SAME when matches are likely but not certain', () => {
    const left = makeNode({ name: 'same', size: 10 });
    const right = makeNode({ name: 'same', size: 11 });
    const policy: IdentityPolicy = {
      strategies: [
        { type: EvidenceType.NAME, weight: 0.6 },
        { type: EvidenceType.SIZE, weight: 0.2 }
      ],
      conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
      thresholds: { sameCertain: 0.9, sameLikely: 0.5, differentCertain: 0.8 },
      casePolicy: CasePolicy.SENSITIVE
    };
    const result = matchNodes(left, right, policy, CasePolicy.SENSITIVE);
    expect(result.verdict).toBe('POSSIBLY_SAME');
    expect(result.confidence).toBe(Confidence.LIKELY);
  });
});
