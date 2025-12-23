import type { Instant, RunId, RootId, VPath } from './ids.js';

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

export interface Coverage {
  runId: RunId;
  scopes: ScanScope[];
}
