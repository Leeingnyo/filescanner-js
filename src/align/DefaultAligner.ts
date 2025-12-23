import type { SnapshotStore } from '../store/SnapshotStore.js';
import type { Aligner, AlignKeyStrategy, AlignmentResult, AlignmentRow, AlignmentCell } from '../types/align.js';
import { AlignKeyType, CellState } from '../types/align.js';
import { CompareMode } from '../types/compare.js';
import type { CompareScope } from '../types/compare.js';
import { isScopeCovered } from '../compare/scope.js';
import { buildRowKey } from './alignKey.js';
import { layersSigHash } from '../node/layersSig.js';
import { LayerKind } from '../types/layers.js';
import { vpathHasPrefix } from '../vpath/prefix.js';
import { ScopeMode } from '../types/scan.js';
import { resolveCasePolicy } from '../root/casePolicy.js';
import { toCanonicalString } from '../node/canonical.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import type { DiffNodePtr } from '../types/compare.js';

export class DefaultAligner implements Aligner {
  constructor(private readonly store: SnapshotStore) {}

  align(snapshotIds: string[], scope: CompareScope, strategy: AlignKeyStrategy, mode: CompareMode): AlignmentResult {
    const rows = new Map<string, { displayKey: string; nodesBySnapshot: Map<string, NodeMeta[]> }>();
    const coverageMap = new Map<string, boolean>();

    for (const snapshotId of snapshotIds) {
      const snapshot = this.store.getSnapshot(snapshotId);
      const covered = isScopeCovered(snapshot.lastCoverage.scopes, scope as any);
      coverageMap.set(snapshotId, covered);
      if (!covered) continue;
      const root = this.store.getRoot(snapshot.rootId);
      const casePolicy = resolveCasePolicy(root.casePolicy, root.capabilities);
      const nodes = this.collectNodes(snapshotId, scope, true);
      for (const node of nodes) {
        const { rowKey, displayKey } = buildRowKey(node, strategy, casePolicy);
        if (!rows.has(rowKey)) {
          rows.set(rowKey, { displayKey, nodesBySnapshot: new Map() });
        }
        const row = rows.get(rowKey)!;
        const list = row.nodesBySnapshot.get(snapshotId) ?? [];
        list.push(node);
        row.nodesBySnapshot.set(snapshotId, list);
      }
    }

    const outputRows: AlignmentRow[] = [];
    for (const [rowKey, row] of rows.entries()) {
      const cells: AlignmentCell[] = [];
      for (const snapshotId of snapshotIds) {
        const covered = coverageMap.get(snapshotId) ?? false;
        if (!covered) {
          cells.push({ state: mode === CompareMode.STRICT ? CellState.NOT_COVERED : CellState.UNKNOWN });
          continue;
        }
        const nodes = row.nodesBySnapshot.get(snapshotId) ?? [];
        if (nodes.length === 0) {
          cells.push({ state: CellState.MISSING });
        } else {
          const ordered = nodes
            .slice()
            .sort((a, b) => {
              const aLayer = a.ref.layers.length;
              const bLayer = b.ref.layers.length;
              if (aLayer !== bLayer) return aLayer - bLayer;
              const aCanon = toCanonicalString(a.ref);
              const bCanon = toCanonicalString(b.ref);
              return aCanon < bCanon ? -1 : aCanon > bCanon ? 1 : 0;
            })
            .map((node) => ({ snapshotId, nodeId: node.nodeId, ref: node.ref } as DiffNodePtr));
          const first = nodes[0];
          const contentHash = Object.values(first.hashes ?? {}).find((h) => h.status === 'PRESENT' && h.value)?.value;
          cells.push({
            state: CellState.PRESENT,
            nodes: ordered,
            fingerprint: { size: first.size, mtime: first.mtime, contentHash }
          });
        }
      }
      outputRows.push({ rowKey, displayKey: row.displayKey, cells });
    }

    outputRows.sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : a.displayKey.localeCompare(b.displayKey)));

    return { snapshotIds, scope, strategy, rows: outputRows };
  }

  private collectNodes(snapshotId: string, scope: CompareScope, includeDeleted: boolean): NodeMeta[] {
    const snapshot = this.store.getSnapshot(snapshotId);
    const rootId = snapshot.rootId;
    const baseAbs = scope.baseVPath;
    const baseLayersHash = layersSigHash([{ kind: LayerKind.OS, rootId }]);

    if (scope.mode === ScopeMode.SINGLE_NODE) {
      const ref = { rootId, layers: [{ kind: LayerKind.OS, rootId }], vpath: baseAbs } as any;
      const node = this.store.getNodeByRef(snapshotId, ref, includeDeleted);
      return node ? [node] : [];
    }

    if (scope.mode === ScopeMode.CHILDREN_ONLY) {
      const parentRef = { rootId, layers: [{ kind: LayerKind.OS, rootId }], vpath: baseAbs } as any;
      return this.store.listChildren(snapshotId, parentRef, undefined, undefined, includeDeleted).nodes;
    }

    const query = this.store.queryNodes(snapshotId, { filter: { vpathPrefix: baseAbs, includeDeleted } });
    return query.nodes.filter((n) => vpathHasPrefix(n.ref.vpath, baseAbs as any) && layersSigHash(n.ref.layers) === baseLayersHash);
  }
}
