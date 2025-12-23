import { NodeSortKey, SortOrder } from '../../types/store/query.js';

function orderDirection(order: SortOrder): string {
  return order === SortOrder.ASC ? 'ASC' : 'DESC';
}

export function buildOrderBy(sort: { key: NodeSortKey; order: SortOrder }): string {
  const dir = orderDirection(sort.order);
  switch (sort.key) {
    case NodeSortKey.NAME:
      return `nameKey COLLATE BINARY ${dir}, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    case NodeSortKey.VPATH:
      return `vpathKey COLLATE BINARY ${dir}, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    case NodeSortKey.SIZE:
      if (sort.order === SortOrder.ASC) {
        return `(size IS NOT NULL) ASC, size ASC, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
      }
      return `(size IS NULL) ASC, size DESC, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    case NodeSortKey.MTIME:
      if (sort.order === SortOrder.ASC) {
        return `(mtime IS NOT NULL) ASC, mtime COLLATE BINARY ASC, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
      }
      return `(mtime IS NULL) ASC, mtime COLLATE BINARY DESC, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    case NodeSortKey.FIRST_SEEN_AT:
      return `firstSeenAt COLLATE BINARY ${dir}, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    case NodeSortKey.LAST_OBSERVED_AT:
      return `lastObservedAt COLLATE BINARY ${dir}, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
    default:
      return `vpathKey COLLATE BINARY ${dir}, canonical COLLATE BINARY ASC, nodeId COLLATE BINARY ASC`;
  }
}
