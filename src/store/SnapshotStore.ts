import type { RootDescriptor } from '../types/root.js';
import type { Snapshot } from '../types/store/snapshot.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import type { NodeRef } from '../types/noderef.js';
import type { NodeQuery, NodeQueryResult, NodeSortKey, Page, SortOrder } from '../types/store/query.js';
import type { Coverage, ScanRun } from '../types/scan.js';
import type { ObservedNode } from '../types/observedNode.js';
import type { RootId, RootKey, SnapshotId, NodeId } from '../types/ids.js';

export interface PatchSession {
  upsertNodes(nodes: ObservedNode[]): void;
  recordCoverage(coverage: Coverage): void;
  commit(): void;
  abort(): void;
}

export interface SnapshotStore {
  registerRoot(desc: RootDescriptor): RootDescriptor;
  getRoot(rootId: RootId): RootDescriptor;
  findRootByKey(rootKey: RootKey): RootDescriptor | undefined;

  createSnapshot(rootId: RootId): Snapshot;
  getSnapshot(snapshotId: SnapshotId): Snapshot;

  beginPatch(snapshotId: SnapshotId, run: ScanRun): PatchSession;

  getNodeById(snapshotId: SnapshotId, nodeId: NodeId): NodeMeta | undefined;
  getNodeByRef(snapshotId: SnapshotId, ref: NodeRef, includeDeleted?: boolean): NodeMeta | undefined;

  listChildren(
    snapshotId: SnapshotId,
    parentRef: NodeRef,
    sort?: { key: NodeSortKey; order: SortOrder },
    page?: Page,
    includeDeleted?: boolean
  ): NodeQueryResult;

  findByEntityKey(snapshotId: SnapshotId, entityKey: string, page?: Page, includeDeleted?: boolean): NodeQueryResult;
  findByOsIdentity(snapshotId: SnapshotId, identityValue: string, page?: Page, includeDeleted?: boolean): NodeQueryResult;
  findByHash(snapshotId: SnapshotId, algo: string, value: string, page?: Page, includeDeleted?: boolean): NodeQueryResult;
  rangeBySize(snapshotId: SnapshotId, min: number, max: number, page?: Page, includeDeleted?: boolean): NodeQueryResult;

  queryNodes(snapshotId: SnapshotId, query: NodeQuery): NodeQueryResult;
}
