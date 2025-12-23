import type { Instant, RootId, RunId, SnapshotId } from '../ids.js';
import type { Coverage } from '../scan.js';

export interface SnapshotStats {
  nodeCount: number;
  dirCount: number;
  fileCount: number;
}

export interface Snapshot {
  snapshotId: SnapshotId;
  rootId: RootId;
  createdAt: Instant;
  lastPatchedAt: Instant;
  lastRunId: RunId;
  lastCoverage: Coverage;
  stats: SnapshotStats;
}
