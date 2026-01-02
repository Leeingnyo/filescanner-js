import { describe, expect, it } from 'vitest';
import { buildRowKey } from './alignKey.js';
import { AlignKeyType, type AlignKeyStrategy } from '../types/align.js';
import { CasePolicy, IdentityPlatform, NodeKind, HashStatus } from '../types/enums.js';
import { sha256HexUtf8 } from '../utils/crypto.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import { LayerKind } from '../types/layers.js';

const SEP = '\u001f';

function makeNode(overrides: Partial<NodeMeta>): NodeMeta {
  return {
    nodeId: 'n:1',
    ref: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/A' },
    kind: NodeKind.FILE,
    name: 'A',
    identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
    entityKey: 'path:r:1:/A',
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

describe('buildRowKey', () => {
  it('uses vpathKey for VPATH strategy', () => {
    const node = makeNode({ ref: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/A/%C3%89' } });
    const strategy: AlignKeyStrategy = { type: AlignKeyType.VPATH };
    const { rowKey } = buildRowKey(node, strategy, CasePolicy.INSENSITIVE);
    const input = '/a/%C3%89';
    expect(rowKey).toBe(`rk:${sha256HexUtf8(`align:VPATH${SEP}${input}`)}`);
  });

  it('uses identity value for OS_FILE_ID strategy', () => {
    const node = makeNode({
      identity: { platform: IdentityPlatform.POSIX, posix: { dev: 1, inode: 2 }, isAvailable: true }
    });
    const strategy: AlignKeyStrategy = { type: AlignKeyType.OS_FILE_ID };
    const { rowKey } = buildRowKey(node, strategy, CasePolicy.SENSITIVE);
    expect(rowKey).toBe(`rk:${sha256HexUtf8(`align:OS_FILE_ID${SEP}posix:1:2`)}`);
  });

  it('prefers sha256 content hash', () => {
    const node = makeNode({
      hashes: {
        md5: { algo: 'md5', value: 'aaa', status: HashStatus.PRESENT },
        sha256: { algo: 'sha256', value: 'bbb', status: HashStatus.PRESENT }
      }
    });
    const strategy: AlignKeyStrategy = { type: AlignKeyType.CONTENT_HASH };
    const { rowKey } = buildRowKey(node, strategy, CasePolicy.SENSITIVE);
    expect(rowKey).toBe(`rk:${sha256HexUtf8(`align:CONTENT_HASH${SEP}hash:sha256:bbb`)}`);
  });

  it('combines parts for COMPOSITE strategy', () => {
    const node = makeNode({
      ref: { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/x' },
      entityKey: 'e:1'
    });
    const strategy: AlignKeyStrategy = { type: AlignKeyType.COMPOSITE, parts: [AlignKeyType.ENTITY_KEY, AlignKeyType.VPATH] };
    const { rowKey } = buildRowKey(node, strategy, CasePolicy.SENSITIVE);
    const input = `e:1${SEP}/x`;
    expect(rowKey).toBe(`rk:${sha256HexUtf8(`align:COMPOSITE${SEP}${input}`)}`);
  });
});
