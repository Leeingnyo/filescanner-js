import type { NodeMeta } from '../../types/nodeMeta.js';
import type { Snapshot } from '../../types/store/snapshot.js';
import type { RootDescriptor } from '../../types/root.js';
import type { RootCapabilities } from '../../types/root.js';
import { CasePolicy, OsKind } from '../../types/enums.js';

export function mapRootRow(row: any): RootDescriptor {
  const capabilities: RootCapabilities = {
    caseSensitive: Boolean(row.capabilitiesCaseSensitive),
    supportsFileId: Boolean(row.capabilitiesSupportsFileId)
  };
  return {
    rootId: row.rootId,
    rootKey: row.rootKey,
    os: row.os as OsKind,
    osPath: row.osPath,
    createdAt: row.createdAt,
    casePolicy: row.casePolicy as CasePolicy,
    capabilities
  };
}

export function mapSnapshotRow(row: any): Snapshot {
  return {
    snapshotId: row.snapshotId,
    rootId: row.rootId,
    createdAt: row.createdAt,
    lastPatchedAt: row.lastPatchedAt,
    lastRunId: row.lastRunId,
    lastCoverage: JSON.parse(row.lastCoverage),
    stats: JSON.parse(row.statsJson)
  };
}

export function mapNodeRow(row: any): NodeMeta {
  return {
    nodeId: row.nodeId,
    ref: { rootId: row.rootId, layers: JSON.parse(row.layersJson), vpath: row.vpath },
    kind: row.kind,
    name: row.name,
    size: row.size === null || row.size === undefined ? undefined : Number(row.size),
    mtime: row.mtime ?? undefined,
    ctime: row.ctime ?? undefined,
    birthtime: row.birthtime ?? undefined,
    identity: JSON.parse(row.identityJson),
    entityKey: row.entityKey,
    firstSeenAt: row.firstSeenAt,
    isDeleted: Boolean(row.isDeleted),
    deletedAt: row.deletedAt ?? undefined,
    hashes: JSON.parse(row.hashesJson),
    extras: JSON.parse(row.extrasJson),
    observedInRunId: row.observedInRunId,
    lastObservedAt: row.lastObservedAt,
    errors: JSON.parse(row.errorsJson)
  } as NodeMeta;
}
