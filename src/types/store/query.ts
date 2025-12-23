import type { RunId, VPath } from '../ids.js';
import { NodeKind } from '../enums.js';
import type { NodeMeta } from '../nodeMeta.js';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC'
}

export enum NodeSortKey {
  NAME = 'NAME',
  VPATH = 'VPATH',
  SIZE = 'SIZE',
  MTIME = 'MTIME',
  FIRST_SEEN_AT = 'FIRST_SEEN_AT',
  LAST_OBSERVED_AT = 'LAST_OBSERVED_AT'
}

export interface Page {
  limit: number;
  cursor?: string;
}

export interface NodeFilter {
  kinds?: NodeKind[];
  vpathPrefix?: VPath;
  observedInRunId?: RunId;
  hasErrors?: boolean;
  minSize?: number;
  maxSize?: number;
  hash?: { algo: string; value: string };
  entityKey?: string;
  includeDeleted?: boolean;
}

export interface NodeQuery {
  filter?: NodeFilter;
  sort?: { key: NodeSortKey; order: SortOrder };
  page?: Page;
}

export interface NodeQueryResult {
  nodes: NodeMeta[];
  nextCursor?: string;
}
