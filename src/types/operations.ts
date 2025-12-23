import type { VPath, RootId } from './ids.js';
import type { NodeRef } from './noderef.js';
import type { NodeError } from './error.js';

export enum OpType {
  COPY = 'COPY',
  MOVE = 'MOVE',
  DELETE = 'DELETE',
  MKDIR = 'MKDIR'
}

export enum ConflictPolicy {
  SKIP = 'SKIP',
  OVERWRITE = 'OVERWRITE',
  RENAME = 'RENAME',
  FAIL = 'FAIL'
}

export interface OpPolicy {
  conflict: ConflictPolicy;
}

export interface Operation {
  opId: string;
  type: OpType;
  src?: NodeRef;
  dst?: { rootId: RootId; vpath: VPath };
  policy: OpPolicy;
}

export interface OperationPlan {
  planId: string;
  createdAt: string;
  ops: Operation[];
  preflight?: {
    conflicts: string[];
    missingSources: string[];
    estimates: { bytesToCopy?: number; opCount: number };
  };
}

export enum OpStatus {
  OK = 'OK',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED'
}

export interface OpResult {
  opId: string;
  status: OpStatus;
  error?: NodeError;
}

export interface ExecutionReport {
  startedAt: string;
  finishedAt: string;
  results: OpResult[];
}

export interface ExecutionSink {
  onStarted(plan: OperationPlan): void;
  onOpStarted(op: Operation): void;
  onOpFinished(op: Operation, result: OpResult): void;
  onError(err: NodeError): void;
  onFinished(report: ExecutionReport): void;
}

export interface ExecControl {
  cancel(): void;
}

export interface Executor {
  dryRun(plan: OperationPlan): Promise<OperationPlan>;
  execute(plan: OperationPlan, sink: ExecutionSink): Promise<{ report: ExecutionReport; control: ExecControl }>;
}
