import type { Snapshot } from '../../types/store/snapshot.js';
import type { NodeMeta } from '../../types/nodeMeta.js';
import type { Instant, NodeId, VPath } from '../../types/ids.js';

export interface StoredNodeDerived {
  layersSigHash: string;
  vpathFold: VPath;
  vpathKey: VPath;
  parentKey: string;
  nameKey: string;
  identityValue?: string;
  hashKeys: string[];
  osVPath: VPath;
}

export interface StoredNode {
  meta: NodeMeta;
  derived: StoredNodeDerived;
}

export interface SnapshotState {
  snapshot: Snapshot;
  nodesById: Map<NodeId, StoredNode>;
  nodesByRefKey: Map<string, NodeId>;
  nodesByEntityKey: Map<string, Set<NodeId>>;
  nodesByIdentity: Map<string, Set<NodeId>>;
  nodesByHash: Map<string, Set<NodeId>>;
  entityFirstSeen: Map<string, Instant>;
  nextNodeId: number;
}
