import type { SnapshotStore } from '../SnapshotStore.js';
import type { RootDescriptor } from '../../types/root.js';
import type { Snapshot } from '../../types/store/snapshot.js';
import type { NodeMeta } from '../../types/nodeMeta.js';
import type { NodeRef } from '../../types/noderef.js';
import type { NodeQuery, NodeQueryResult, Page } from '../../types/store/query.js';
import { NodeSortKey, SortOrder } from '../../types/store/query.js';
import type { Coverage, ScanRun, ScanScope } from '../../types/scan.js';
import { ScopeCompleteness, ScopeMode } from '../../types/scan.js';
import type { ObservedNode } from '../../types/observedNode.js';
import type { RootId, RootKey, SnapshotId, NodeId, VPath, Instant } from '../../types/ids.js';
import { CasePolicy, NodeKind } from '../../types/enums.js';
import { resolveCasePolicy } from '../../root/casePolicy.js';
import { deriveEntityKey } from '../../node/entityKey.js';
import { identityValue } from '../../node/identityKey.js';
import { layersSigHash } from '../../node/layersSig.js';
import { vpathFold } from '../../vpath/fold.js';
import { vpathKey } from '../../vpath/key.js';
import { nodeRefKey } from '../../node/refKey.js';
import { parentKeyOf, parentKeyFor } from '../../node/parentKey.js';
import { nameKey } from '../../node/nameKey.js';
import { osLayerVPath } from '../../node/osVPath.js';
import { nowInstant } from '../../utils/time.js';
import { createId, createIncrementalId } from '../../utils/id.js';
import { vpathHasPrefix } from '../../vpath/prefix.js';
import { isImmediateChild } from '../../vpath/normalize.js';
import { MemoryPatchSession } from './MemoryPatchSession.js';
import type { SnapshotState, StoredNode, StoredNodeDerived } from './types.js';
import { applyPagination } from './pagination.js';
import { compareStoredNode } from './sort.js';
import { applyFilter } from './filters.js';

export interface MemorySnapshotStoreOptions {
  now?: () => Instant;
  createSnapshotId?: () => SnapshotId;
}

export class MemorySnapshotStore implements SnapshotStore {
  private readonly rootsById = new Map<RootId, RootDescriptor>();
  private readonly rootIdByKey = new Map<RootKey, RootId>();
  private readonly snapshots = new Map<SnapshotId, SnapshotState>();
  private readonly nowFn: () => Instant;
  private readonly snapshotIdFn: () => SnapshotId;

  constructor(options: MemorySnapshotStoreOptions = {}) {
    this.nowFn = options.now ?? nowInstant;
    this.snapshotIdFn = options.createSnapshotId ?? (() => createId('s:'));
  }

  registerRoot(desc: RootDescriptor): RootDescriptor {
    const existingId = this.rootIdByKey.get(desc.rootKey);
    if (existingId) {
      const existing = this.rootsById.get(existingId);
      if (!existing) {
        throw new Error('Root registry corrupted');
      }
      return existing;
    }
    if (this.rootsById.has(desc.rootId)) {
      throw new Error('RootId already registered');
    }
    this.rootsById.set(desc.rootId, desc);
    this.rootIdByKey.set(desc.rootKey, desc.rootId);
    return desc;
  }

  getRoot(rootId: RootId): RootDescriptor {
    const root = this.rootsById.get(rootId);
    if (!root) throw new Error('Root not found');
    return root;
  }

  findRootByKey(rootKey: RootKey): RootDescriptor | undefined {
    const rootId = this.rootIdByKey.get(rootKey);
    if (!rootId) return undefined;
    return this.rootsById.get(rootId);
  }

  createSnapshot(rootId: RootId): Snapshot {
    const root = this.getRoot(rootId);
    const createdAt = this.nowFn();
    const snapshot: Snapshot = {
      snapshotId: this.snapshotIdFn(),
      rootId: root.rootId,
      createdAt,
      lastPatchedAt: createdAt,
      lastRunId: '' as any,
      lastCoverage: { runId: '' as any, scopes: [] },
      stats: { nodeCount: 0, dirCount: 0, fileCount: 0 }
    };
    const state: SnapshotState = {
      snapshot,
      nodesById: new Map(),
      nodesByRefKey: new Map(),
      nodesByEntityKey: new Map(),
      nodesByIdentity: new Map(),
      nodesByHash: new Map(),
      entityFirstSeen: new Map(),
      nextNodeId: 1
    };
    this.snapshots.set(snapshot.snapshotId, state);
    return snapshot;
  }

  getSnapshot(snapshotId: SnapshotId): Snapshot {
    const state = this.snapshots.get(snapshotId);
    if (!state) throw new Error('Snapshot not found');
    return state.snapshot;
  }

  beginPatch(snapshotId: SnapshotId, run: ScanRun): MemoryPatchSession {
    const state = this.requireSnapshot(snapshotId);
    return new MemoryPatchSession(this, state, run);
  }

  getNodeById(snapshotId: SnapshotId, nodeId: NodeId): NodeMeta | undefined {
    const state = this.requireSnapshot(snapshotId);
    const stored = state.nodesById.get(nodeId);
    return stored?.meta;
  }

  getNodeByRef(snapshotId: SnapshotId, ref: NodeRef, includeDeleted = false): NodeMeta | undefined {
    const state = this.requireSnapshot(snapshotId);
    const casePolicy = this.resolveSnapshotCasePolicy(state.snapshot.rootId);
    const refKey = nodeRefKey(ref, casePolicy);
    const nodeId = state.nodesByRefKey.get(refKey);
    if (!nodeId) return undefined;
    const stored = state.nodesById.get(nodeId);
    if (!stored) return undefined;
    if (!includeDeleted && stored.meta.isDeleted) return undefined;
    return stored.meta;
  }

  listChildren(
    snapshotId: SnapshotId,
    parentRef: NodeRef,
    sort: { key: NodeSortKey; order: SortOrder } = { key: NodeSortKey.NAME, order: SortOrder.ASC },
    page?: Page,
    includeDeleted = false
  ): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const casePolicy = this.resolveSnapshotCasePolicy(state.snapshot.rootId);
    const parentKey = parentKeyFor(parentRef);
    const nodes = Array.from(state.nodesById.values()).filter((node) => {
      if (!includeDeleted && node.meta.isDeleted) return false;
      if (node.derived.parentKey !== parentKey) return false;
      if (node.meta.ref.vpath === parentRef.vpath) return false;
      return true;
    });
    nodes.sort((a, b) => compareStoredNode(a, b, sort));
    const { items, nextCursor } = applyPagination(nodes, page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  findByEntityKey(snapshotId: SnapshotId, entityKey: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const nodes = this.mapSetToNodes(state, state.nodesByEntityKey.get(entityKey), includeDeleted);
    nodes.sort((a, b) => compareStoredNode(a, b, { key: NodeSortKey.VPATH, order: SortOrder.ASC }));
    const { items, nextCursor } = applyPagination(nodes, page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  findByOsIdentity(snapshotId: SnapshotId, identityValue: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const nodes = this.mapSetToNodes(state, state.nodesByIdentity.get(identityValue), includeDeleted);
    nodes.sort((a, b) => compareStoredNode(a, b, { key: NodeSortKey.VPATH, order: SortOrder.ASC }));
    const { items, nextCursor } = applyPagination(nodes, page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  findByHash(snapshotId: SnapshotId, algo: string, value: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const key = `${algo}:${value}`;
    const nodes = this.mapSetToNodes(state, state.nodesByHash.get(key), includeDeleted);
    nodes.sort((a, b) => compareStoredNode(a, b, { key: NodeSortKey.VPATH, order: SortOrder.ASC }));
    const { items, nextCursor } = applyPagination(nodes, page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  rangeBySize(snapshotId: SnapshotId, min: number, max: number, page?: Page, includeDeleted = false): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const nodes = Array.from(state.nodesById.values()).filter((node) => {
      if (!includeDeleted && node.meta.isDeleted) return false;
      if (node.meta.size === undefined) return false;
      return node.meta.size >= min && node.meta.size <= max;
    });
    nodes.sort((a, b) => compareStoredNode(a, b, { key: NodeSortKey.SIZE, order: SortOrder.ASC }));
    const { items, nextCursor } = applyPagination(nodes, page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  queryNodes(snapshotId: SnapshotId, query: NodeQuery): NodeQueryResult {
    const state = this.requireSnapshot(snapshotId);
    const casePolicy = this.resolveSnapshotCasePolicy(state.snapshot.rootId);
    const filtered = applyFilter(Array.from(state.nodesById.values()), query.filter, casePolicy);
    const sort = query.sort ?? { key: NodeSortKey.VPATH, order: SortOrder.ASC };
    filtered.sort((a, b) => compareStoredNode(a, b, sort));
    const { items, nextCursor } = applyPagination(filtered, query.page);
    return { nodes: items.map((item) => item.meta), nextCursor };
  }

  upsertNodesInternal(state: SnapshotState, nodes: ObservedNode[], run: ScanRun): void {
    const casePolicy = this.resolveSnapshotCasePolicy(state.snapshot.rootId);
    for (const node of nodes) {
      this.upsertNode(state, node, run, casePolicy);
    }
  }

  commitPatchInternal(state: SnapshotState, run: ScanRun, coverage: Coverage): void {
    const casePolicy = this.resolveSnapshotCasePolicy(state.snapshot.rootId);
    for (const scope of coverage.scopes) {
      if (scope.completeness !== ScopeCompleteness.COMPLETE) continue;
      this.reconcileScope(state, run.runId, scope.scope, casePolicy);
    }
    state.snapshot.lastPatchedAt = this.nowFn();
    state.snapshot.lastRunId = run.runId;
    state.snapshot.lastCoverage = coverage;
    this.updateStats(state);
  }

  private reconcileScope(state: SnapshotState, runId: string, scope: ScanScope, casePolicy: CasePolicy): void {
    const targetPrefix = vpathKey(scope.baseVPath, casePolicy);
    const nodes = Array.from(state.nodesById.values());
    for (const node of nodes) {
      const osVpath = casePolicy === CasePolicy.INSENSITIVE ? vpathFold(node.derived.osVPath) : node.derived.osVPath;
      const inScope = this.isInScope(osVpath, targetPrefix, scope.mode);
      if (!inScope) continue;
      if (node.meta.observedInRunId === runId) continue;
      if (!node.meta.isDeleted) {
        node.meta.isDeleted = true;
        node.meta.deletedAt = this.nowFn();
      }
    }
  }

  private isInScope(candidate: VPath, base: VPath, mode: ScanScope['mode']): boolean {
    if (mode === ScopeMode.FULL_SUBTREE) {
      return vpathHasPrefix(candidate, base);
    }
    if (mode === ScopeMode.CHILDREN_ONLY) {
      return isImmediateChild(base, candidate);
    }
    return candidate === base;
  }

  private updateStats(state: SnapshotState): void {
    let nodeCount = 0;
    let dirCount = 0;
    let fileCount = 0;
    for (const node of state.nodesById.values()) {
      if (node.meta.isDeleted) continue;
      nodeCount += 1;
      if (node.meta.kind === NodeKind.DIR) dirCount += 1;
      if (node.meta.kind === NodeKind.FILE) fileCount += 1;
    }
    state.snapshot.stats = { nodeCount, dirCount, fileCount };
  }

  private upsertNode(state: SnapshotState, observed: ObservedNode, run: ScanRun, casePolicy: CasePolicy): void {
    const refKey = nodeRefKey(observed.ref, casePolicy);
    const existingId = state.nodesByRefKey.get(refKey);
    const existing = existingId ? state.nodesById.get(existingId) : undefined;

    const entityKey = deriveEntityKey(observed.identity, observed.ref, casePolicy);
    let firstSeenAt = state.entityFirstSeen.get(entityKey);
    if (!firstSeenAt) {
      firstSeenAt = observed.lastObservedAt;
      state.entityFirstSeen.set(entityKey, firstSeenAt);
    }

    const nodeId = existing?.meta.nodeId ?? this.nextNodeId(state);

    const meta: NodeMeta = {
      nodeId,
      ref: observed.ref,
      kind: observed.kind,
      name: observed.name,
      size: observed.size,
      mtime: observed.mtime,
      ctime: observed.ctime,
      birthtime: observed.birthtime,
      identity: observed.identity,
      entityKey,
      firstSeenAt,
      isDeleted: false,
      deletedAt: undefined,
      hashes: observed.hashes,
      extras: observed.extras,
      observedInRunId: observed.observedInRunId,
      lastObservedAt: observed.lastObservedAt,
      errors: observed.errors
    };

    const derived = this.deriveKeys(meta, casePolicy);

    if (existing) {
      this.removeIndexes(state, existing);
    }

    const stored: StoredNode = { meta, derived };
    state.nodesById.set(nodeId, stored);
    state.nodesByRefKey.set(refKey, nodeId);
    this.addIndexes(state, stored);
  }

  private deriveKeys(meta: NodeMeta, casePolicy: CasePolicy): StoredNodeDerived {
    const vfold = vpathFold(meta.ref.vpath as VPath);
    const vkey = vpathKey(meta.ref.vpath as VPath, casePolicy);
    const parentKey = parentKeyOf(meta.ref);
    const identity = identityValue(meta.identity) ?? undefined;
    const hashKeys = Object.values(meta.hashes)
      .filter((hash) => hash.status === 'PRESENT' && hash.value)
      .map((hash) => `${hash.algo}:${hash.value}`);
    return {
      layersSigHash: layersSigHash(meta.ref.layers),
      vpathFold: vfold,
      vpathKey: vkey,
      parentKey,
      nameKey: nameKey(meta.name, casePolicy),
      identityValue: identity,
      hashKeys,
      osVPath: osLayerVPath(meta.ref)
    };
  }

  private addIndexes(state: SnapshotState, stored: StoredNode): void {
    const entitySet = state.nodesByEntityKey.get(stored.meta.entityKey) ?? new Set<NodeId>();
    entitySet.add(stored.meta.nodeId);
    state.nodesByEntityKey.set(stored.meta.entityKey, entitySet);

    if (stored.derived.identityValue) {
      const set = state.nodesByIdentity.get(stored.derived.identityValue) ?? new Set<NodeId>();
      set.add(stored.meta.nodeId);
      state.nodesByIdentity.set(stored.derived.identityValue, set);
    }

    for (const hashKey of stored.derived.hashKeys) {
      const set = state.nodesByHash.get(hashKey) ?? new Set<NodeId>();
      set.add(stored.meta.nodeId);
      state.nodesByHash.set(hashKey, set);
    }
  }

  private removeIndexes(state: SnapshotState, stored: StoredNode): void {
    const entitySet = state.nodesByEntityKey.get(stored.meta.entityKey);
    entitySet?.delete(stored.meta.nodeId);

    if (stored.derived.identityValue) {
      const set = state.nodesByIdentity.get(stored.derived.identityValue);
      set?.delete(stored.meta.nodeId);
    }

    for (const hashKey of stored.derived.hashKeys) {
      const set = state.nodesByHash.get(hashKey);
      set?.delete(stored.meta.nodeId);
    }
  }

  private resolveSnapshotCasePolicy(rootId: RootId): CasePolicy {
    const root = this.getRoot(rootId);
    return resolveCasePolicy(root.casePolicy, root.capabilities);
  }

  private nextNodeId(state: SnapshotState): NodeId {
    const next = state.nextNodeId;
    state.nextNodeId += 1;
    return createIncrementalId('n:', next);
  }

  private mapSetToNodes(state: SnapshotState, ids: Set<NodeId> | undefined, includeDeleted: boolean): StoredNode[] {
    if (!ids) return [];
    const out: StoredNode[] = [];
    for (const id of ids) {
      const node = state.nodesById.get(id);
      if (!node) continue;
      if (!includeDeleted && node.meta.isDeleted) continue;
      out.push(node);
    }
    return out;
  }

  private requireSnapshot(snapshotId: SnapshotId): SnapshotState {
    const state = this.snapshots.get(snapshotId);
    if (!state) throw new Error('Snapshot not found');
    return state;
  }
}
