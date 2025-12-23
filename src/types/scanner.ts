import type { Coverage, ScanRun } from './scan.js';
import type { ObservedNode } from './observedNode.js';
import type { NodeError } from './error.js';
import type { ScanRequest } from './scanRequest.js';

export interface ScanSink {
  onRunStarted(run: ScanRun): void;
  onNodes(batch: ObservedNode[]): void;
  onError(error: NodeError): void;
  onRunFinished(run: ScanRun, coverage: Coverage): void;
}

export interface ScanControl {
  cancel(): void;
  pause?(): void;
  resume?(): void;
}

export interface Scanner {
  startScan(req: ScanRequest, sink: ScanSink): { run: ScanRun; control: ScanControl };
}
