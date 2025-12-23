import type { NodeMeta } from '../types/nodeMeta.js';
import type { NodeRef } from '../types/noderef.js';
import type { NodeError } from '../types/error.js';

export interface ResolveResult {
  exists: boolean;
  meta?: NodeMeta;
  error?: NodeError;
}

export interface Resolver {
  statNow(ref: NodeRef): Promise<ResolveResult>;
}
