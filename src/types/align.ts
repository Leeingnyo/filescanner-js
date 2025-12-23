import type { VPath, SnapshotId } from './ids.js';
import type { CompareScope } from './compare.js';
import type { DiffNodePtr } from './compare.js';

export enum AlignKeyType {
  VPATH = 'VPATH',
  ENTITY_KEY = 'ENTITY_KEY',
  OS_FILE_ID = 'OS_FILE_ID',
  CONTENT_HASH = 'CONTENT_HASH',
  COMPOSITE = 'COMPOSITE'
}

export interface AlignKeyStrategy {
  type: AlignKeyType;
  parts?: AlignKeyType[];
}

export enum CellState {
  PRESENT = 'PRESENT',
  MISSING = 'MISSING',
  UNKNOWN = 'UNKNOWN',
  NOT_COVERED = 'NOT_COVERED'
}

export interface AlignmentCell {
  state: CellState;
  nodes?: DiffNodePtr[];
  fingerprint?: { size?: number; mtime?: string; contentHash?: string };
}

export interface AlignmentRow {
  rowKey: string;
  displayKey: string;
  cells: AlignmentCell[];
}

export interface AlignmentResult {
  snapshotIds: SnapshotId[];
  scope: CompareScope;
  strategy: AlignKeyStrategy;
  rows: AlignmentRow[];
}

export interface Aligner {
  align(snapshotIds: SnapshotId[], scope: CompareScope, strategy: AlignKeyStrategy, mode: 'STRICT' | 'LENIENT'): AlignmentResult;
}
