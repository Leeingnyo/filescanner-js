import type { PatchSession } from '../SnapshotStore.js';
import type { ObservedNode } from '../../types/observedNode.js';
import type { Coverage, ScanRun } from '../../types/scan.js';
import type { SnapshotState } from './types.js';
import type { MemorySnapshotStore } from './MemorySnapshotStore.js';

export class MemoryPatchSession implements PatchSession {
  private coverage?: Coverage;
  private closed = false;

  constructor(
    private readonly store: MemorySnapshotStore,
    private readonly state: SnapshotState,
    private readonly run: ScanRun
  ) {}

  upsertNodes(nodes: ObservedNode[]): void {
    this.ensureOpen();
    this.store.upsertNodesInternal(this.state, nodes, this.run);
  }

  recordCoverage(coverage: Coverage): void {
    this.ensureOpen();
    if (coverage.runId !== this.run.runId) {
      throw new Error('Coverage runId mismatch');
    }
    this.coverage = coverage;
  }

  commit(): void {
    this.ensureOpen();
    if (!this.coverage) {
      throw new Error('Coverage not recorded');
    }
    this.store.commitPatchInternal(this.state, this.run, this.coverage);
    this.closed = true;
  }

  abort(): void {
    this.closed = true;
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('Patch session is closed');
    }
  }
}
