import type { StoredNode } from './types.js';
import { utf8ByteCompare } from '../../utils/utf8.js';
import { NodeSortKey, SortOrder } from '../../types/store/query.js';
import { toCanonicalString } from '../../node/canonical.js';

function compareOptionalString(a?: string, b?: string, order: SortOrder = SortOrder.ASC): number {
  const hasA = a !== undefined;
  const hasB = b !== undefined;
  if (!hasA && !hasB) return 0;
  if (!hasA) return order === SortOrder.ASC ? -1 : 1;
  if (!hasB) return order === SortOrder.ASC ? 1 : -1;
  return utf8ByteCompare(a as string, b as string);
}

function compareOptionalNumber(a?: number, b?: number, order: SortOrder = SortOrder.ASC): number {
  const hasA = a !== undefined;
  const hasB = b !== undefined;
  if (!hasA && !hasB) return 0;
  if (!hasA) return order === SortOrder.ASC ? -1 : 1;
  if (!hasB) return order === SortOrder.ASC ? 1 : -1;
  return (a as number) - (b as number);
}

function comparePrimary(a: StoredNode, b: StoredNode, key: NodeSortKey): number {
  switch (key) {
    case NodeSortKey.NAME:
      return utf8ByteCompare(a.derived.nameKey, b.derived.nameKey);
    case NodeSortKey.VPATH:
      return utf8ByteCompare(a.derived.vpathKey, b.derived.vpathKey);
    case NodeSortKey.SIZE:
      return compareOptionalNumber(a.meta.size, b.meta.size, SortOrder.ASC);
    case NodeSortKey.MTIME:
      return compareOptionalString(a.meta.mtime, b.meta.mtime, SortOrder.ASC);
    case NodeSortKey.FIRST_SEEN_AT:
      return compareOptionalString(a.meta.firstSeenAt, b.meta.firstSeenAt, SortOrder.ASC);
    case NodeSortKey.LAST_OBSERVED_AT:
      return compareOptionalString(a.meta.lastObservedAt, b.meta.lastObservedAt, SortOrder.ASC);
    default:
      return 0;
  }
}

export function compareStoredNode(a: StoredNode, b: StoredNode, sort: { key: NodeSortKey; order: SortOrder }): number {
  const primary = comparePrimary(a, b, sort.key);
  if (primary !== 0) {
    return sort.order === SortOrder.ASC ? primary : -primary;
  }
  const canonA = toCanonicalString(a.meta.ref);
  const canonB = toCanonicalString(b.meta.ref);
  const canonCompare = utf8ByteCompare(canonA, canonB);
  if (canonCompare !== 0) return canonCompare;
  return utf8ByteCompare(a.meta.nodeId, b.meta.nodeId);
}
