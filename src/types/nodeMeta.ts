import type { NodeRef } from './noderef.js';
import type { HashMap } from './hash.js';
import type { FileIdentity } from './identity.js';
import type { Instant, NodeId, RunId } from './ids.js';
import type { NodeError } from './error.js';
import { NodeKind } from './enums.js';

export interface NodeMeta {
  nodeId: NodeId;
  ref: NodeRef;
  kind: NodeKind;
  name: string;
  size?: number;
  mtime?: Instant;
  ctime?: Instant;
  birthtime?: Instant;
  identity: FileIdentity;
  entityKey: string;
  firstSeenAt: Instant;
  isDeleted: boolean;
  deletedAt?: Instant;
  hashes: HashMap;
  extras: unknown;
  observedInRunId: RunId;
  lastObservedAt: Instant;
  errors: NodeError[];
}
