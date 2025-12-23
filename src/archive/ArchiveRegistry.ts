import type { ArchiveReader } from './types.js';

export class ArchiveRegistry {
  private readonly readers: ArchiveReader[];

  constructor(readers: ArchiveReader[]) {
    this.readers = readers;
  }

  getReader(format: string): ArchiveReader | undefined {
    return this.readers.find((reader) => reader.supports(format));
  }
}
