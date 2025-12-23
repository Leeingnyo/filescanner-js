import yauzl from 'yauzl';
import { utf8ByteCompare } from '../../utils/utf8.js';
import { NodeKind } from '../../types/enums.js';
import type { ArchiveCapabilities, ArchiveEntry, ArchiveHandle, ArchiveOpenOptions, ArchiveReader, ReadableSource } from '../types.js';
import { OpenCostModel } from '../types.js';
import { decodeZipFileName, normalizeZipPath } from './normalize.js';
import { readStreamToBuffer } from '../../utils/streams.js';
import type { VPath } from '../../types/ids.js';

interface EntryRecord {
  entry: ArchiveEntry;
  raw: yauzl.Entry;
}

export class ZipArchiveReader implements ArchiveReader {
  supports(format: string): boolean {
    return format.toLowerCase() === 'zip';
  }

  capabilities(_format: string): ArchiveCapabilities {
    return {
      canListEntries: true,
      canStatEntry: true,
      canOpenStream: true,
      canSeek: false,
      openCostModel: OpenCostModel.RANDOM_EXPENSIVE
    };
  }

  async open(container: ReadableSource, _format: string, options: ArchiveOpenOptions = {}): Promise<ArchiveHandle> {
    const zipFile = await this.openZip(container);
    const { entries, entryMap, errors } = await this.collectEntries(zipFile, options);
    return {
      listEntries: (prefix?: VPath) => {
        if (!prefix || prefix === '/') return entries.map((r) => r.entry);
        return entries.filter((r) => r.entry.entryVPath === prefix || r.entry.entryVPath.startsWith(`${prefix}/`)).map((r) => r.entry);
      },
      statEntry: (entryVPath: VPath) => {
        const record = entryMap.get(entryVPath);
        if (!record) throw new Error('Entry not found');
        return record.entry;
      },
      openEntryStream: async (entryVPath: VPath) => {
        const record = entryMap.get(entryVPath);
        if (!record) throw new Error('Entry not found');
        return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
          zipFile.openReadStream(record.raw, (err, stream) => {
            if (err || !stream) {
              reject(err ?? new Error('Failed to open entry stream'));
              return;
            }
            resolve(stream);
          });
        });
      },
      close: () => {
        zipFile.close();
      },
      errors
    };
  }

  private async openZip(container: ReadableSource): Promise<yauzl.ZipFile> {
    if ('path' in container) {
      return new Promise((resolve, reject) => {
        yauzl.open(container.path, { lazyEntries: true, decodeStrings: false, autoClose: false }, (err, zipfile) => {
          if (err || !zipfile) {
            reject(err ?? new Error('Failed to open zip'));
            return;
          }
          resolve(zipfile);
        });
      });
    }
    if ('buffer' in container) {
      return new Promise((resolve, reject) => {
        yauzl.fromBuffer(container.buffer, { lazyEntries: true, decodeStrings: false, autoClose: false }, (err, zipfile) => {
          if (err || !zipfile) {
            reject(err ?? new Error('Failed to open zip'));
            return;
          }
          resolve(zipfile);
        });
      });
    }
    if ('stream' in container) {
      const buffer = await readStreamToBuffer(container.stream);
      return new Promise((resolve, reject) => {
        yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: false, autoClose: false }, (err, zipfile) => {
          if (err || !zipfile) {
            reject(err ?? new Error('Failed to open zip'));
            return;
          }
          resolve(zipfile);
        });
      });
    }
    throw new Error('Unsupported container source');
  }

  private async collectEntries(
    zipFile: yauzl.ZipFile,
    options: ArchiveOpenOptions
  ): Promise<{ entries: EntryRecord[]; entryMap: Map<VPath, EntryRecord>; errors: Error[] }> {
    const entries: EntryRecord[] = [];
    const entryMap = new Map<VPath, EntryRecord>();
    const errors: Error[] = [];

    await new Promise<void>((resolve, reject) => {
      zipFile.on('entry', (entry: yauzl.Entry) => {
        try {
          const isUtf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
          const rawName = entry.fileName as unknown as Buffer;
          const decoded = decodeZipFileName(rawName, isUtf8);
          const entryVPath = normalizeZipPath(decoded);
          const isDir = decoded.endsWith('/');
          const archiveEntry: ArchiveEntry = {
            entryVPath,
            kind: isDir ? NodeKind.DIR : NodeKind.FILE,
            size: entry.uncompressedSize,
            mtime: entry.getLastModDate().toISOString()
          };
          const record = { entry: archiveEntry, raw: entry };
          entries.push(record);
          entryMap.set(entryVPath, record);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Unknown zip entry error');
          errors.push(error);
          options.onError?.(error);
        } finally {
          zipFile.readEntry();
        }
      });
      zipFile.on('end', () => resolve());
      zipFile.on('error', (err) => reject(err));
      zipFile.readEntry();
    });

    entries.sort((a, b) => utf8ByteCompare(a.entry.entryVPath, b.entry.entryVPath));
    return { entries, entryMap, errors };
  }
}
