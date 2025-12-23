import type { NodeFilter } from '../../types/store/query.js';
import type { StoredNode } from './types.js';
import { CasePolicy } from '../../types/enums.js';
import { vpathKey } from '../../vpath/key.js';
import { vpathHasPrefix } from '../../vpath/prefix.js';

export function applyFilter(nodes: StoredNode[], filter: NodeFilter | undefined, casePolicy: CasePolicy): StoredNode[] {
  if (!filter) return nodes;
  const includeDeleted = filter.includeDeleted ?? false;
  const prefixKey = filter.vpathPrefix ? vpathKey(filter.vpathPrefix, casePolicy) : undefined;

  return nodes.filter((node) => {
    if (!includeDeleted && node.meta.isDeleted) return false;
    if (filter.kinds && !filter.kinds.includes(node.meta.kind)) return false;
    if (filter.observedInRunId && node.meta.observedInRunId !== filter.observedInRunId) return false;
    if (filter.hasErrors !== undefined) {
      const hasErrors = node.meta.errors.length > 0;
      if (filter.hasErrors !== hasErrors) return false;
    }
    if (filter.minSize !== undefined) {
      if (node.meta.size === undefined || node.meta.size < filter.minSize) return false;
    }
    if (filter.maxSize !== undefined) {
      if (node.meta.size === undefined || node.meta.size > filter.maxSize) return false;
    }
    if (filter.hash) {
      const hash = node.meta.hashes[filter.hash.algo];
      if (!hash || hash.value !== filter.hash.value) return false;
    }
    if (filter.entityKey && node.meta.entityKey !== filter.entityKey) return false;
    if (prefixKey) {
      if (!vpathHasPrefix(node.derived.vpathKey, prefixKey)) return false;
    }
    return true;
  });
}
