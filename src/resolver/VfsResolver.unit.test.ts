import { describe, expect, it } from 'vitest';
import { VfsResolver } from './VfsResolver.js';
import { LayerKind } from '../types/layers.js';
import { NodeKind, ErrorCode, IdentityPlatform } from '../types/enums.js';
import type { NodeMeta } from '../types/nodeMeta.js';

describe('VfsResolver', () => {
  it('returns meta when node exists', async () => {
    const ref = { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/' };
    const meta: NodeMeta = {
      nodeId: 'n:1',
      ref,
      kind: NodeKind.DIR,
      name: '',
      identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
      entityKey: 'path:r:1:/',
      firstSeenAt: new Date(1_700_000_000_000).toISOString(),
      isDeleted: false,
      hashes: {},
      extras: {},
      observedInRunId: 'run:1',
      lastObservedAt: new Date(1_700_000_000_000).toISOString(),
      errors: []
    };
    const vfs = {
      stat: async () => meta
    };
    const resolver = new VfsResolver(vfs as any);
    const result = await resolver.statNow(ref);
    expect(result.exists).toBe(true);
    expect(result.meta?.nodeId).toBe('n:1');
  });

  it('maps stat errors to NodeError', async () => {
    const ref = { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/' };
    const vfs = {
      stat: async () => {
        const err: any = new Error('missing');
        err.code = 'ENOENT';
        throw err;
      }
    };
    const resolver = new VfsResolver(vfs as any);
    const result = await resolver.statNow(ref);
    expect(result.exists).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.NOT_FOUND);
  });
});
