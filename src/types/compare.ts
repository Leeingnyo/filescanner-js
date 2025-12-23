import type { VPath, SnapshotId, NodeId } from './ids.js';
import type { NodeRef } from './noderef.js';
import type { ScopeMode } from './scan.js';

export enum EvidenceType {
  OS_FILE_ID = 'OS_FILE_ID',
  VPATH = 'VPATH',
  NAME = 'NAME',
  SIZE = 'SIZE',
  MTIME = 'MTIME',
  CONTENT_HASH = 'CONTENT_HASH',
  PERCEPTUAL_HASH = 'PERCEPTUAL_HASH'
}

export enum EvidenceOutcome {
  MATCH = 'MATCH',
  MISMATCH = 'MISMATCH',
  MISSING_LEFT = 'MISSING_LEFT',
  MISSING_RIGHT = 'MISSING_RIGHT',
  NOT_APPLICABLE = 'NOT_APPLICABLE'
}

export interface Evidence {
  type: EvidenceType;
  outcome: EvidenceOutcome;
  leftValue?: string;
  rightValue?: string;
  weight: number;
}

export enum Verdict {
  SAME = 'SAME',
  DIFFERENT = 'DIFFERENT',
  POSSIBLY_SAME = 'POSSIBLY_SAME',
  UNKNOWN = 'UNKNOWN',
  MOVED = 'MOVED'
}

export enum Confidence {
  CERTAIN = 'CERTAIN',
  LIKELY = 'LIKELY',
  POSSIBLE = 'POSSIBLE'
}

export interface MatchResult {
  verdict: Verdict;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface WeightedStrategy {
  type: EvidenceType;
  weight: number;
}

export enum ConflictHandling {
  PREFER_STRONGER_EVIDENCE = 'PREFER_STRONGER_EVIDENCE',
  MARK_CONFLICT = 'MARK_CONFLICT'
}

export interface ScoreThresholds {
  sameCertain: number;
  sameLikely: number;
  differentCertain: number;
}

export interface IdentityPolicy {
  strategies: WeightedStrategy[];
  conflictHandling: ConflictHandling;
  thresholds: ScoreThresholds;
  casePolicy: 'AUTO' | 'SENSITIVE' | 'INSENSITIVE';
}

export interface MovePolicy {
  enabled: boolean;
  strategies: EvidenceType[];
  minConfidence: Confidence;
}

export interface DuplicatePolicy {
  keys: EvidenceType[];
  minGroupSize: number;
}

export enum CompareMode {
  STRICT = 'STRICT',
  LENIENT = 'LENIENT'
}

export interface CompareScope {
  baseVPath: VPath;
  mode: ScopeMode;
}

export interface CompareOptions {
  mode: CompareMode;
  scope: CompareScope;
  identity: IdentityPolicy;
  move: MovePolicy;
  requireObservedCoverage: boolean;
}

export enum DiffEntryType {
  ADDED = 'ADDED',
  REMOVED = 'REMOVED',
  MODIFIED = 'MODIFIED',
  MOVED = 'MOVED',
  TYPE_CHANGED = 'TYPE_CHANGED',
  CONFLICT = 'CONFLICT',
  UNKNOWN = 'UNKNOWN',
  NOT_COVERED = 'NOT_COVERED'
}

export interface DiffNodePtr {
  snapshotId: SnapshotId;
  nodeId?: NodeId;
  ref?: NodeRef;
}

export interface DiffEntry {
  path: VPath;
  type: DiffEntryType;
  left?: DiffNodePtr;
  right?: DiffNodePtr;
  match?: MatchResult;
  notes?: string;
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  moved: number;
  unknown: number;
  notCovered: number;
}

export interface DiffResult {
  summary: DiffSummary;
  entries: DiffEntry[];
}

export interface Comparer {
  compare(leftSnapshotId: SnapshotId, rightSnapshotId: SnapshotId, opts: CompareOptions): DiffResult;
  compareSubtree(
    leftSnapshotId: SnapshotId,
    leftBase: NodeRef,
    rightSnapshotId: SnapshotId,
    rightBase: NodeRef,
    opts: CompareOptions
  ): DiffResult;
}
