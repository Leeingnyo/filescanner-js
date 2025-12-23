import Database from 'better-sqlite3';
import type { SnapshotStore } from '../SnapshotStore.js';
import type { RootDescriptor } from '../../types/root.js';
import type { Snapshot } from '../../types/store/snapshot.js';
import type { NodeMeta } from '../../types/nodeMeta.js';
import type { NodeRef } from '../../types/noderef.js';
import type { NodeQuery, NodeQueryResult, Page } from '../../types/store/query.js';
import { NodeSortKey, SortOrder } from '../../types/store/query.js';
import type { Coverage, ScanRun, ScanScope } from '../../types/scan.js';
import { ScopeMode } from '../../types/scan.js';
import type { ObservedNode } from '../../types/observedNode.js';
import type { RootId, RootKey, SnapshotId, NodeId, Instant, VPath } from '../../types/ids.js';
import { CasePolicy, NodeKind } from '../../types/enums.js';
import { resolveCasePolicy } from '../../root/casePolicy.js';
import { deriveEntityKey } from '../../node/entityKey.js';
import { parentKeyFor } from '../../node/parentKey.js';
import { vpathKey } from '../../vpath/key.js';
import { nowInstant } from '../../utils/time.js';
import { createId } from '../../utils/id.js';
import { SqlitePatchSession } from './SqlitePatchSession.js';
import { ensureSchema } from './schema.js';
import { mapNodeRow, mapRootRow, mapSnapshotRow } from './rowMapper.js';
import { deriveObservedNodeFields } from './derive.js';
import { buildOrderBy } from './order.js';
import { layersSigHash } from '../../node/layersSig.js';

export interface SqliteSnapshotStoreOptions {
  path?: string;
  now?: () => Instant;
}

export class SqliteSnapshotStore implements SnapshotStore {
  private readonly db: Database.Database;
  private readonly nowFn: () => Instant;

  constructor(options: SqliteSnapshotStoreOptions = {}) {
    const path = options.path ?? ':memory:';
    this.db = new Database(path);
    ensureSchema(this.db);
    this.nowFn = options.now ?? nowInstant;
  }

  close(): void {
    this.db.close();
  }

  registerRoot(desc: RootDescriptor): RootDescriptor {
    const existing = this.findRootByKey(desc.rootKey);
    if (existing) return existing;
    const idRow = this.db.prepare('SELECT rootId FROM roots WHERE rootId = ?').get(desc.rootId);
    if (idRow) throw new Error('RootId already registered');
    this.db
      .prepare(
        `INSERT INTO roots (rootId, rootKey, os, osPath, createdAt, casePolicy, capabilitiesCaseSensitive, capabilitiesSupportsFileId)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        desc.rootId,
        desc.rootKey,
        desc.os,
        desc.osPath,
        desc.createdAt,
        desc.casePolicy,
        desc.capabilities.caseSensitive ? 1 : 0,
        desc.capabilities.supportsFileId ? 1 : 0
      );
    return desc;
  }

  getRoot(rootId: RootId): RootDescriptor {
    const row = this.db.prepare('SELECT * FROM roots WHERE rootId = ?').get(rootId);
    if (!row) throw new Error('Root not found');
    return mapRootRow(row);
  }

  findRootByKey(rootKey: RootKey): RootDescriptor | undefined {
    const row = this.db.prepare('SELECT * FROM roots WHERE rootKey = ?').get(rootKey);
    return row ? mapRootRow(row) : undefined;
  }

  createSnapshot(rootId: RootId): Snapshot {
    const root = this.getRoot(rootId);
    const createdAt = this.nowFn();
    const snapshot: Snapshot = {
      snapshotId: createId('s:'),
      rootId: root.rootId,
      createdAt,
      lastPatchedAt: createdAt,
      lastRunId: '' as any,
      lastCoverage: { runId: '' as any, scopes: [] },
      stats: { nodeCount: 0, dirCount: 0, fileCount: 0 }
    };
    this.db
      .prepare(
        `INSERT INTO snapshots (snapshotId, rootId, createdAt, lastPatchedAt, lastRunId, lastCoverage, statsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.snapshotId,
        snapshot.rootId,
        snapshot.createdAt,
        snapshot.lastPatchedAt,
        snapshot.lastRunId,
        JSON.stringify(snapshot.lastCoverage),
        JSON.stringify(snapshot.stats)
      );
    return snapshot;
  }

  getSnapshot(snapshotId: SnapshotId): Snapshot {
    const row = this.db.prepare('SELECT * FROM snapshots WHERE snapshotId = ?').get(snapshotId);
    if (!row) throw new Error('Snapshot not found');
    return mapSnapshotRow(row);
  }

  beginPatch(snapshotId: SnapshotId, run: ScanRun): SqlitePatchSession {
    this.getSnapshot(snapshotId);
    return new SqlitePatchSession(this, run, snapshotId);
  }

  getNodeById(snapshotId: SnapshotId, nodeId: NodeId): NodeMeta | undefined {
    const row = this.db.prepare('SELECT * FROM nodes WHERE snapshotId = ? AND nodeId = ?').get(snapshotId, nodeId);
    return row ? mapNodeRow(row) : undefined;
  }

  getNodeByRef(snapshotId: SnapshotId, ref: NodeRef, includeDeleted = false): NodeMeta | undefined {
    const casePolicy = this.resolveSnapshotCasePolicy(snapshotId);
    const key = vpathKey(ref.vpath as VPath, casePolicy);
    const layersHash = layersSigHash(ref.layers);
    const row = this.db
      .prepare(
        `SELECT * FROM nodes WHERE snapshotId = ? AND rootId = ? AND layersSigHash = ? AND vpathKey = ? ${
          includeDeleted ? '' : 'AND isDeleted = 0'
        }`
      )
      .get(snapshotId, ref.rootId, layersHash, key);
    return row ? mapNodeRow(row) : undefined;
  }

  listChildren(
    snapshotId: SnapshotId,
    parentRef: NodeRef,
    sort: { key: NodeSortKey; order: SortOrder } = { key: NodeSortKey.NAME, order: SortOrder.ASC },
    page?: Page,
    includeDeleted = false
  ): NodeQueryResult {
    const parentKey = parentKeyFor(parentRef);
    const { limit, offset } = parsePage(page);
    const orderBy = buildOrderBy(sort);
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes WHERE snapshotId = ? AND parentKey = ? ${includeDeleted ? '' : 'AND isDeleted = 0'}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(snapshotId, parentKey, limit, offset);
    return finalizePage(rows, limit, offset);
  }

  findByEntityKey(snapshotId: SnapshotId, entityKey: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const { limit, offset } = parsePage(page);
    const orderBy = buildOrderBy({ key: NodeSortKey.VPATH, order: SortOrder.ASC });
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes WHERE snapshotId = ? AND entityKey = ? ${includeDeleted ? '' : 'AND isDeleted = 0'}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(snapshotId, entityKey, limit, offset);
    return finalizePage(rows, limit, offset);
  }

  findByOsIdentity(snapshotId: SnapshotId, identityValue: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const { limit, offset } = parsePage(page);
    const orderBy = buildOrderBy({ key: NodeSortKey.VPATH, order: SortOrder.ASC });
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes WHERE snapshotId = ? AND identityValue = ? ${includeDeleted ? '' : 'AND isDeleted = 0'}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(snapshotId, identityValue, limit, offset);
    return finalizePage(rows, limit, offset);
  }

  findByHash(snapshotId: SnapshotId, algo: string, value: string, page?: Page, includeDeleted = false): NodeQueryResult {
    const { limit, offset } = parsePage(page);
    const orderBy = buildOrderBy({ key: NodeSortKey.VPATH, order: SortOrder.ASC });
    const rows = this.db
      .prepare(
        `SELECT n.* FROM nodes n
         JOIN node_hashes h ON n.snapshotId = h.snapshotId AND n.nodeId = h.nodeId
         WHERE n.snapshotId = ? AND h.algo = ? AND h.value = ? ${includeDeleted ? '' : 'AND n.isDeleted = 0'}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(snapshotId, algo, value, limit, offset);
    return finalizePage(rows, limit, offset);
  }

  rangeBySize(snapshotId: SnapshotId, min: number, max: number, page?: Page, includeDeleted = false): NodeQueryResult {
    const { limit, offset } = parsePage(page);
    const orderBy = buildOrderBy({ key: NodeSortKey.SIZE, order: SortOrder.ASC });
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes WHERE snapshotId = ? AND size >= ? AND size <= ? ${includeDeleted ? '' : 'AND isDeleted = 0'}
         ORDER BY ${orderBy} LIMIT ? OFFSET ?`
      )
      .all(snapshotId, min, max, limit, offset);
    return finalizePage(rows, limit, offset);
  }

  queryNodes(snapshotId: SnapshotId, query: NodeQuery): NodeQueryResult {
    const filter = query.filter ?? {};
    const includeDeleted = filter.includeDeleted ?? false;
    const { limit, offset } = parsePage(query.page);
    const orderBy = buildOrderBy(query.sort ?? { key: NodeSortKey.VPATH, order: SortOrder.ASC });

    const params: any[] = [snapshotId];
    const clauses: string[] = ['n.snapshotId = ?'];

    if (!includeDeleted) clauses.push('n.isDeleted = 0');
    if (filter.kinds && filter.kinds.length > 0) {
      clauses.push(`n.kind IN (${filter.kinds.map(() => '?').join(', ')})`);
      params.push(...filter.kinds);
    }
    if (filter.vpathPrefix) {
      const casePolicy = this.resolveSnapshotCasePolicy(snapshotId);
      const prefix = vpathKey(filter.vpathPrefix, casePolicy);
      const like = `${prefix}/%`;
      clauses.push('(n.vpathKey = ? OR n.vpathKey LIKE ?)');
      params.push(prefix, like);
    }
    if (filter.observedInRunId) {
      clauses.push('n.observedInRunId = ?');
      params.push(filter.observedInRunId);
    }
    if (filter.hasErrors !== undefined) {
      clauses.push(filter.hasErrors ? 'n.errorsJson != ?' : 'n.errorsJson = ?');
      params.push('[]');
    }
    if (filter.minSize !== undefined) {
      clauses.push('n.size >= ?');
      params.push(filter.minSize);
    }
    if (filter.maxSize !== undefined) {
      clauses.push('n.size <= ?');
      params.push(filter.maxSize);
    }
    if (filter.entityKey) {
      clauses.push('n.entityKey = ?');
      params.push(filter.entityKey);
    }

    let joinHash = '';
    if (filter.hash) {
      joinHash = 'JOIN node_hashes h ON n.snapshotId = h.snapshotId AND n.nodeId = h.nodeId';
      clauses.push('h.algo = ? AND h.value = ?');
      params.push(filter.hash.algo, filter.hash.value);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT n.* FROM nodes n ${joinHash} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(sql).all(...params);
    return finalizePage(rows, limit, offset);
  }

  upsertNodesInternal(snapshotId: SnapshotId, nodes: ObservedNode[], run: ScanRun): void {
    const casePolicy = this.resolveSnapshotCasePolicy(snapshotId);
    const tx = this.db.transaction(() => {
      for (const node of nodes) {
        this.upsertNode(snapshotId, node, casePolicy, run);
      }
    });
    tx();
  }

  commitPatchInternal(snapshotId: SnapshotId, run: ScanRun, coverage: Coverage): void {
    const casePolicy = this.resolveSnapshotCasePolicy(snapshotId);
    const tx = this.db.transaction(() => {
      for (const scope of coverage.scopes) {
        this.reconcileScope(snapshotId, run.runId, scope, casePolicy);
      }
      const stats = this.computeStats(snapshotId);
      const lastPatchedAt = this.nowFn();
      this.db
        .prepare(
          `UPDATE snapshots SET lastPatchedAt = ?, lastRunId = ?, lastCoverage = ?, statsJson = ? WHERE snapshotId = ?`
        )
        .run(lastPatchedAt, run.runId, JSON.stringify(coverage), JSON.stringify(stats), snapshotId);
    });
    tx();
  }

  private upsertNode(snapshotId: SnapshotId, observed: ObservedNode, casePolicy: CasePolicy, run: ScanRun): void {
    if (observed.observedInRunId !== run.runId) {
      // allow, but preserve observedInRunId from node
    }

    const derived = deriveObservedNodeFields(observed, casePolicy);
    const entityKey = deriveEntityKey(observed.identity, observed.ref, casePolicy);

    const entityRow = this.db
      .prepare('SELECT firstSeenAt FROM entities WHERE snapshotId = ? AND entityKey = ?')
      .get(snapshotId, entityKey) as { firstSeenAt: string } | undefined;

    const firstSeenAt = entityRow ? entityRow.firstSeenAt : observed.lastObservedAt;
    if (!entityRow) {
      this.db.prepare('INSERT INTO entities (snapshotId, entityKey, firstSeenAt) VALUES (?, ?, ?)').run(
        snapshotId,
        entityKey,
        firstSeenAt
      );
    }

    const existing = this.db
      .prepare(
        `SELECT nodeId FROM nodes WHERE snapshotId = ? AND rootId = ? AND layersSigHash = ? AND vpathKey = ?`
      )
      .get(snapshotId, observed.ref.rootId, derived.layersSigHash, derived.vpathKey) as { nodeId: string } | undefined;

    const nodeId = existing ? existing.nodeId : createId('n:');

    const row = {
      snapshotId,
      nodeId,
      rootId: observed.ref.rootId,
      layersJson: derived.layersJson,
      layersSigHash: derived.layersSigHash,
      vpath: observed.ref.vpath,
      vpathFold: derived.vpathFold,
      vpathKey: derived.vpathKey,
      parentKey: derived.parentKey,
      name: observed.name,
      nameKey: derived.nameKey,
      kind: observed.kind,
      size: observed.size ?? null,
      mtime: observed.mtime ?? null,
      ctime: observed.ctime ?? null,
      birthtime: observed.birthtime ?? null,
      identityJson: JSON.stringify(observed.identity),
      identityValue: derived.identityValue ?? null,
      entityKey,
      firstSeenAt,
      isDeleted: 0,
      deletedAt: null,
      hashesJson: JSON.stringify(observed.hashes),
      extrasJson: JSON.stringify(observed.extras ?? null),
      observedInRunId: observed.observedInRunId,
      lastObservedAt: observed.lastObservedAt,
      errorsJson: JSON.stringify(observed.errors),
      canonical: derived.canonical,
      osVpath: derived.osVpath,
      osVpathKey: derived.osVpathKey
    };

    if (existing) {
      this.db
        .prepare(
          `UPDATE nodes SET
            layersJson=@layersJson,
            vpath=@vpath,
            vpathFold=@vpathFold,
            vpathKey=@vpathKey,
            parentKey=@parentKey,
            name=@name,
            nameKey=@nameKey,
            kind=@kind,
            size=@size,
            mtime=@mtime,
            ctime=@ctime,
            birthtime=@birthtime,
            identityJson=@identityJson,
            identityValue=@identityValue,
            entityKey=@entityKey,
            firstSeenAt=@firstSeenAt,
            isDeleted=0,
            deletedAt=NULL,
            hashesJson=@hashesJson,
            extrasJson=@extrasJson,
            observedInRunId=@observedInRunId,
            lastObservedAt=@lastObservedAt,
            errorsJson=@errorsJson,
            canonical=@canonical,
            osVpath=@osVpath,
            osVpathKey=@osVpathKey
          WHERE snapshotId=@snapshotId AND nodeId=@nodeId`
        )
        .run(row);
    } else {
      this.db
        .prepare(
          `INSERT INTO nodes (
            snapshotId, nodeId, rootId, layersJson, layersSigHash, vpath, vpathFold, vpathKey, parentKey,
            name, nameKey, kind, size, mtime, ctime, birthtime, identityJson, identityValue, entityKey,
            firstSeenAt, isDeleted, deletedAt, hashesJson, extrasJson, observedInRunId, lastObservedAt,
            errorsJson, canonical, osVpath, osVpathKey
          ) VALUES (
            @snapshotId, @nodeId, @rootId, @layersJson, @layersSigHash, @vpath, @vpathFold, @vpathKey, @parentKey,
            @name, @nameKey, @kind, @size, @mtime, @ctime, @birthtime, @identityJson, @identityValue, @entityKey,
            @firstSeenAt, @isDeleted, @deletedAt, @hashesJson, @extrasJson, @observedInRunId, @lastObservedAt,
            @errorsJson, @canonical, @osVpath, @osVpathKey
          )`
        )
        .run(row);
    }

    this.db.prepare('DELETE FROM node_hashes WHERE snapshotId = ? AND nodeId = ?').run(snapshotId, nodeId);
    for (const key of derived.hashKeys) {
      const sep = key.indexOf(':');
      const algo = sep >= 0 ? key.slice(0, sep) : key;
      const value = sep >= 0 ? key.slice(sep + 1) : '';
      this.db
        .prepare('INSERT OR IGNORE INTO node_hashes (snapshotId, nodeId, algo, value) VALUES (?, ?, ?, ?)')
        .run(snapshotId, nodeId, algo, value);
    }
  }

  private reconcileScope(snapshotId: SnapshotId, runId: string, scope: ScanScope, casePolicy: CasePolicy): void {
    const baseKey = vpathKey(scope.baseVPath as VPath, casePolicy);
    if (scope.mode === ScopeMode.FULL_SUBTREE) {
      const like = baseKey === '/' ? '/%' : `${baseKey}/%`;
      this.db
        .prepare(
          `UPDATE nodes SET isDeleted = 1, deletedAt = ?
           WHERE snapshotId = ? AND isDeleted = 0 AND observedInRunId != ?
             AND (osVpathKey = ? OR osVpathKey LIKE ?)`
        )
        .run(this.nowFn(), snapshotId, runId, baseKey, like);
      return;
    }

    if (scope.mode === ScopeMode.CHILDREN_ONLY) {
      const prefix = baseKey === '/' ? '/' : `${baseKey}/`;
      this.db
        .prepare(
          `UPDATE nodes SET isDeleted = 1, deletedAt = ?
           WHERE snapshotId = ? AND isDeleted = 0 AND observedInRunId != ?
             AND osVpathKey LIKE ?
             AND instr(substr(osVpathKey, length(?) + 1), '/') = 0`
        )
        .run(this.nowFn(), snapshotId, runId, `${prefix}%`, prefix);
      return;
    }

    this.db
      .prepare(
        `UPDATE nodes SET isDeleted = 1, deletedAt = ?
         WHERE snapshotId = ? AND isDeleted = 0 AND observedInRunId != ? AND osVpathKey = ?`
      )
      .run(this.nowFn(), snapshotId, runId, baseKey);
  }

  private computeStats(snapshotId: SnapshotId): { nodeCount: number; dirCount: number; fileCount: number } {
    const nodeCount = this.db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE snapshotId = ? AND isDeleted = 0')
      .get(snapshotId).count as number;
    const dirCount = this.db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE snapshotId = ? AND isDeleted = 0 AND kind = ?')
      .get(snapshotId, NodeKind.DIR).count as number;
    const fileCount = this.db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE snapshotId = ? AND isDeleted = 0 AND kind = ?')
      .get(snapshotId, NodeKind.FILE).count as number;
    return { nodeCount, dirCount, fileCount };
  }

  private resolveSnapshotCasePolicy(snapshotId: SnapshotId): CasePolicy {
    const snapshot = this.getSnapshot(snapshotId);
    const root = this.getRoot(snapshot.rootId);
    return resolveCasePolicy(root.casePolicy, root.capabilities);
  }
}

function parsePage(page?: Page): { limit: number; offset: number } {
  if (!page) return { limit: Number.MAX_SAFE_INTEGER, offset: 0 };
  const limit = page.limit;
  const offset = page.cursor ? Number.parseInt(page.cursor, 10) : 0;
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error('Invalid cursor');
  }
  return { limit: limit + 1, offset };
}

function finalizePage(rows: any[], limitPlusOne: number, offset: number): NodeQueryResult {
  const hasMore = rows.length === limitPlusOne;
  const items = hasMore ? rows.slice(0, limitPlusOne - 1) : rows;
  const nextCursor = hasMore ? String(offset + limitPlusOne - 1) : undefined;
  return { nodes: items.map(mapNodeRow), nextCursor };
}
