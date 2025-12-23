import type { SnapshotStore } from '../store/SnapshotStore.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import type { NodeRef } from '../types/noderef.js';
import type { CompareOptions, DiffEntry, DiffResult, DiffSummary } from '../types/compare.js';
import { CompareMode, DiffEntryType, ConflictHandling, Verdict } from '../types/compare.js';
import { matchNodes } from './match.js';
import { detectMoves } from './move.js';
import { isScopeCovered } from './scope.js';
import { resolveCasePolicy } from '../root/casePolicy.js';
import { CasePolicy } from '../types/enums.js';
import { LayerKind } from '../types/layers.js';
import { layersSigHash } from '../node/layersSig.js';
import { joinVPath } from '../vpath/normalize.js';
import { vpathHasPrefix } from '../vpath/prefix.js';
import { ScopeMode } from '../types/scan.js';
import type { DiffNodePtr } from '../types/compare.js';
import { NodeSortKey, SortOrder } from '../types/store/query.js';

export class DefaultComparer {
  constructor(private readonly store: SnapshotStore) {}

  compare(leftSnapshotId: string, rightSnapshotId: string, opts: CompareOptions): DiffResult {
    const leftRootId = this.store.getSnapshot(leftSnapshotId).rootId;
    const rightRootId = this.store.getSnapshot(rightSnapshotId).rootId;
    const leftBase: NodeRef = { rootId: leftRootId, layers: [{ kind: LayerKind.OS, rootId: leftRootId }], vpath: '/' };
    const rightBase: NodeRef = { rootId: rightRootId, layers: [{ kind: LayerKind.OS, rootId: rightRootId }], vpath: '/' };
    return this.compareSubtree(leftSnapshotId, leftBase, rightSnapshotId, rightBase, opts);
  }

  compareSubtree(
    leftSnapshotId: string,
    leftBase: NodeRef,
    rightSnapshotId: string,
    rightBase: NodeRef,
    opts: CompareOptions
  ): DiffResult {
    const leftSnapshot = this.store.getSnapshot(leftSnapshotId);
    const rightSnapshot = this.store.getSnapshot(rightSnapshotId);

    const leftScope = { baseVPath: joinVPath(leftBase.vpath, opts.scope.baseVPath), mode: opts.scope.mode };
    const rightScope = { baseVPath: joinVPath(rightBase.vpath, opts.scope.baseVPath), mode: opts.scope.mode };
    const leftCovered = isScopeCovered(leftSnapshot.lastCoverage.scopes, leftScope as any);
    const rightCovered = isScopeCovered(rightSnapshot.lastCoverage.scopes, rightScope as any);

    if (opts.requireObservedCoverage && (!leftCovered || !rightCovered)) {
      return {
        summary: { added: 0, removed: 0, modified: 0, moved: 0, unknown: 0, notCovered: 1 },
        entries: [{ path: opts.scope.baseVPath, type: DiffEntryType.NOT_COVERED }]
      };
    }

    const leftNodes = this.collectNodes(leftSnapshotId, leftBase, opts.scope, leftCovered);
    const rightNodes = this.collectNodes(rightSnapshotId, rightBase, opts.scope, rightCovered);

    const identityCase = resolveCasePolicy(opts.identity.casePolicy as CasePolicy, this.store.getRoot(leftSnapshot.rootId).capabilities);

    const entries: DiffEntry[] = [];
    const removed: NodeMeta[] = [];
    const added: NodeMeta[] = [];

    const paths = new Set<string>([...leftNodes.keys(), ...rightNodes.keys()]);
    const sortedPaths = Array.from(paths).sort();

    for (const path of sortedPaths) {
      const left = leftNodes.get(path);
      const right = rightNodes.get(path);
      if (left && right) {
        if (left.kind !== right.kind) {
          entries.push({
            path,
            type: DiffEntryType.TYPE_CHANGED,
            left: ptr(leftSnapshotId, left),
            right: ptr(rightSnapshotId, right)
          });
          continue;
        }
        const match = matchNodes(left, right, opts.identity, identityCase);
        const matchScore = match.evidence.reduce((sum, ev) => sum + (ev.outcome === 'MATCH' ? ev.weight : 0), 0);
        const mismatchScore = match.evidence.reduce((sum, ev) => sum + (ev.outcome === 'MISMATCH' ? ev.weight : 0), 0);
        const strongConflict = matchScore >= opts.identity.thresholds.sameLikely && mismatchScore >= opts.identity.thresholds.differentCertain;
        if (strongConflict && opts.identity.conflictHandling === ConflictHandling.MARK_CONFLICT) {
          entries.push({
            path,
            type: DiffEntryType.CONFLICT,
            left: ptr(leftSnapshotId, left),
            right: ptr(rightSnapshotId, right),
            match
          });
          continue;
        }
        if (match.verdict !== Verdict.SAME) {
          entries.push({
            path,
            type: DiffEntryType.MODIFIED,
            left: ptr(leftSnapshotId, left),
            right: ptr(rightSnapshotId, right),
            match
          });
        }
        continue;
      }
      if (left && !right) {
        if (opts.mode === CompareMode.LENIENT && (!leftCovered || !rightCovered)) {
          entries.push({ path, type: DiffEntryType.UNKNOWN, left: ptr(leftSnapshotId, left) });
        } else {
          entries.push({ path, type: DiffEntryType.REMOVED, left: ptr(leftSnapshotId, left) });
          removed.push(left);
        }
        continue;
      }
      if (!left && right) {
        if (opts.mode === CompareMode.LENIENT && (!leftCovered || !rightCovered)) {
          entries.push({ path, type: DiffEntryType.UNKNOWN, right: ptr(rightSnapshotId, right) });
        } else {
          entries.push({ path, type: DiffEntryType.ADDED, right: ptr(rightSnapshotId, right) });
          added.push(right);
        }
      }
    }

    if (opts.move.enabled && removed.length > 0 && added.length > 0) {
      const moves = detectMoves(removed, added, opts.identity, opts.move, identityCase);
      const movedLeftIds = new Set(moves.map((m) => m.left.nodeId));
      const movedRightIds = new Set(moves.map((m) => m.right.nodeId));
      for (const move of moves) {
        if (move.left.ref.vpath === move.right.ref.vpath) continue;
        entries.push({
          path: move.right.ref.vpath,
          type: DiffEntryType.MOVED,
          left: ptr(leftSnapshotId, move.left),
          right: ptr(rightSnapshotId, move.right),
          match: move.match
        });
      }
      // filter out moved added/removed entries
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        if (entry.type === DiffEntryType.REMOVED && entry.left && movedLeftIds.has(entry.left.nodeId ?? '')) {
          entries.splice(i, 1);
        } else if (entry.type === DiffEntryType.ADDED && entry.right && movedRightIds.has(entry.right.nodeId ?? '')) {
          entries.splice(i, 1);
        }
      }
    }

    const summary = summarize(entries);
    return { summary, entries };
  }

  private collectNodes(snapshotId: string, base: NodeRef, scope: { baseVPath: string; mode: ScopeMode }, includeDeleted: boolean): Map<string, NodeMeta> {
    const baseAbs = joinVPath(base.vpath, scope.baseVPath as any) as string;
    const baseLayersHash = layersSigHash(base.layers);
    const result = new Map<string, NodeMeta>();

    if (scope.mode === ScopeMode.SINGLE_NODE) {
      const ref = { ...base, vpath: baseAbs } as NodeRef;
      const node = this.store.getNodeByRef(snapshotId, ref, includeDeleted);
      if (node && layersSigHash(node.ref.layers) === baseLayersHash) {
        result.set(relativeVPath(baseAbs, node.ref.vpath), node);
      }
      return result;
    }

    if (scope.mode === ScopeMode.CHILDREN_ONLY) {
      const parentRef = { ...base, vpath: baseAbs } as NodeRef;
      const children = this.store.listChildren(snapshotId, parentRef, undefined, undefined, includeDeleted).nodes;
      for (const child of children) {
        if (layersSigHash(child.ref.layers) !== baseLayersHash) continue;
        result.set(relativeVPath(baseAbs, child.ref.vpath), child);
      }
      return result;
    }

    const query = this.store.queryNodes(snapshotId, { filter: { vpathPrefix: baseAbs, includeDeleted }, sort: { key: NodeSortKey.VPATH, order: SortOrder.ASC } });
    for (const node of query.nodes) {
      if (!vpathHasPrefix(node.ref.vpath, baseAbs as any)) continue;
      if (layersSigHash(node.ref.layers) !== baseLayersHash) continue;
      result.set(relativeVPath(baseAbs, node.ref.vpath), node);
    }
    return result;
  }
}

function ptr(snapshotId: string, node: NodeMeta): DiffNodePtr {
  return { snapshotId, nodeId: node.nodeId, ref: node.ref };
}

function relativeVPath(base: string, target: string): string {
  if (base === '/') return target;
  if (target === base) return '/';
  if (target.startsWith(`${base}/`)) {
    return `/${target.slice(base.length + 1)}`;
  }
  return target;
}

function summarize(entries: DiffEntry[]): DiffSummary {
  const summary = { added: 0, removed: 0, modified: 0, moved: 0, unknown: 0, notCovered: 0 };
  for (const entry of entries) {
    switch (entry.type) {
      case DiffEntryType.ADDED:
        summary.added += 1;
        break;
      case DiffEntryType.REMOVED:
        summary.removed += 1;
        break;
      case DiffEntryType.MODIFIED:
      case DiffEntryType.TYPE_CHANGED:
      case DiffEntryType.CONFLICT:
        summary.modified += 1;
        break;
      case DiffEntryType.MOVED:
        summary.moved += 1;
        break;
      case DiffEntryType.UNKNOWN:
        summary.unknown += 1;
        break;
      case DiffEntryType.NOT_COVERED:
        summary.notCovered += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}
