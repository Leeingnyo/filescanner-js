import { SqliteSnapshotStore } from '../../../../src/store/sqlite/SqliteSnapshotStore.js';
import { OsKind, CasePolicy, NodeKind, IdentityPlatform, HashStatus } from '../../../../src/types/enums.js';
import type { RootDescriptor } from '../../../../src/types/root.js';
import type { ObservedNode } from '../../../../src/types/observedNode.js';
import type { NodeRef } from '../../../../src/types/noderef.js';
import type { Instant, RunId, RootId, VPath } from '../../../../src/types/ids.js';
import { LayerKind } from '../../../../src/types/layers.js';

export function makeClock(start = 1_700_000_000_000): () => Instant {
  let current = start;
  return () => new Date(current++).toISOString();
}

export function makeStore(now = makeClock()): SqliteSnapshotStore {
  return new SqliteSnapshotStore({ path: ':memory:', now });
}

export function makeRoot(rootId = 'r:1', rootKey = 'posixpath:/tmp/root'): RootDescriptor {
  return {
    rootId,
    rootKey,
    os: OsKind.POSIX,
    osPath: '/tmp/root',
    createdAt: new Date(1_700_000_000_000).toISOString(),
    casePolicy: CasePolicy.AUTO,
    capabilities: { caseSensitive: false, supportsFileId: true }
  };
}

export function makeRef(rootId: RootId, vpath: VPath): NodeRef {
  return { rootId, layers: [{ kind: LayerKind.OS, rootId }], vpath };
}

export function makeObservedNode(params: {
  rootId: RootId;
  vpath: VPath;
  name: string;
  runId: RunId;
  kind?: NodeKind;
  size?: number;
  mtime?: Instant;
  identity?: { dev: number; inode: number };
  hash?: { algo: string; value: string };
  lastObservedAt?: Instant;
}): ObservedNode {
  const identity = params.identity
    ? { platform: IdentityPlatform.POSIX, posix: params.identity, isAvailable: true }
    : { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
  const hashes = params.hash
    ? { [params.hash.algo]: { algo: params.hash.algo, value: params.hash.value, status: HashStatus.PRESENT } }
    : {};
  return {
    ref: makeRef(params.rootId, params.vpath),
    kind: params.kind ?? NodeKind.FILE,
    name: params.name,
    size: params.size,
    mtime: params.mtime,
    identity,
    hashes,
    extras: {},
    observedInRunId: params.runId,
    lastObservedAt: params.lastObservedAt ?? new Date(1_700_000_000_000).toISOString(),
    errors: []
  };
}
