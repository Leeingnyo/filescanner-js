import type { Instant, RunId, RootId, VPath } from './ids.js';
import type { NodeError } from './error.js';

export enum ScopeMode {
  SINGLE_NODE = 'SINGLE_NODE',
  CHILDREN_ONLY = 'CHILDREN_ONLY',
  FULL_SUBTREE = 'FULL_SUBTREE'
}

export interface ScanScope {
  baseVPath: VPath;
  mode: ScopeMode;
}

export enum RunStatus {
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
  CANCELED = 'CANCELED',
  FAILED = 'FAILED'
}

export interface ScanRun {
  runId: RunId;
  rootId: RootId;
  startedAt: Instant;
  finishedAt?: Instant;
  requestedScopes: ScanScope[];
  status: RunStatus;
}

export enum ScopeCompleteness {
  COMPLETE = 'COMPLETE',
  PARTIAL = 'PARTIAL'
}

export interface CoverageScope {
  scope: ScanScope;
  completeness: ScopeCompleteness;
  errors?: NodeError[];
}

export interface Coverage {
  runId: RunId;
  scopes: CoverageScope[];
}
