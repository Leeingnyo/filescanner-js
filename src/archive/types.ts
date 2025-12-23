import type { VPath } from '../types/ids.js';
import { NodeKind } from '../types/enums.js';

export enum OpenCostModel {
  RANDOM_CHEAP = 'RANDOM_CHEAP',
  RANDOM_EXPENSIVE = 'RANDOM_EXPENSIVE',
  STREAM_ONLY = 'STREAM_ONLY'
}

export interface ArchiveCapabilities {
  canListEntries: boolean;
  canStatEntry: boolean;
  canOpenStream: boolean;
  canSeek: boolean;
  openCostModel: OpenCostModel;
}

export interface ArchiveEntry {
  entryVPath: VPath;
  kind: NodeKind;
  size?: number;
  mtime?: string;
}

export interface ArchiveOpenOptions {
  password?: string;
  onError?: (err: Error) => void;
}

export type ReadableSource = { path: string } | { buffer: Buffer } | { stream: NodeJS.ReadableStream };

export interface ArchiveHandle {
  listEntries(prefix?: VPath): Iterable<ArchiveEntry>;
  statEntry(entryVPath: VPath): ArchiveEntry;
  openEntryStream(entryVPath: VPath): Promise<NodeJS.ReadableStream>;
  openEntryRange?(entryVPath: VPath, offset: number, length: number): Promise<NodeJS.ReadableStream>;
  close(): void;
  errors?: Error[];
}

export interface ArchiveReader {
  supports(format: string): boolean;
  capabilities(format: string): ArchiveCapabilities;
  open(container: ReadableSource, format: string, options?: ArchiveOpenOptions): Promise<ArchiveHandle>;
}
