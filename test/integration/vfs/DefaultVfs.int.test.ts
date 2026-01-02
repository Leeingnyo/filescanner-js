import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { DefaultVfs } from '../../../src/vfs/DefaultVfs.js';
import { ArchiveRegistry } from '../../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../../src/archive/zip/ZipArchiveReader.js';
import { CasePolicy, NodeKind, OsKind } from '../../../src/types/enums.js';
import { LayerKind } from '../../../src/types/layers.js';
import { readStreamToBuffer } from '../../../src/utils/streams.js';
import type { ArchiveHandle, ArchiveReader, ArchiveOpenOptions, ReadableSource } from '../../../src/archive/types.js';
import { OpenCostModel } from '../../../src/archive/types.js';
import { Readable } from 'node:stream';

class StubArchiveReader implements ArchiveReader {
  public rangeCalled = false;

  supports(format: string): boolean {
    return format === 'stub';
  }

  capabilities(): any {
    return {
      canListEntries: true,
      canStatEntry: true,
      canOpenStream: true,
      canSeek: true,
      openCostModel: OpenCostModel.RANDOM_CHEAP
    };
  }

  async open(_container: ReadableSource, _format: string, _options: ArchiveOpenOptions = {}): Promise<ArchiveHandle> {
    return {
      listEntries: () => [],
      statEntry: () => ({ entryVPath: '/data.txt', kind: NodeKind.FILE, size: 4, mtime: new Date().toISOString() }),
      openEntryStream: async () => Readable.from([Buffer.from('data')]),
      openEntryRange: async () => {
        this.rangeCalled = true;
        return Readable.from([Buffer.from('data')]);
      },
      close: () => {}
    };
  }
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-'));
}

function createZip(zipPath: string, entries: { name: string; content: string }[]): Promise<void> {
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content, 'utf8'), entry.name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    zip.outputStream.pipe(out);
    out.on('close', () => resolve());
    out.on('error', reject);
  });
}

describe('DefaultVfs', () => {
  it('lists and stats OS children and reads ranges', async () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello world');
    fs.mkdirSync(path.join(dir, 'dir'));

    const root = {
      rootId: 'r:1',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const rootRef = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/' };

    const children = await vfs.listChildren(rootRef);
    const names = children.map((ref) => ref.vpath).sort();
    expect(names).toEqual(['/a.txt', '/dir']);

    const fileRef = { ...rootRef, vpath: '/a.txt' };
    const stat = await vfs.stat(fileRef);
    expect(stat.kind).toBe(NodeKind.FILE);
    expect(stat.size).toBe(11);
    expect(stat.name).toBe('a.txt');

    const stream = await vfs.openReadRange(fileRef, 0, 5);
    const buffer = await readStreamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('hello');
  });

  it('lists and reads archive entries', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'archive.zip');
    await createZip(zipPath, [
      { name: 'a.txt', content: 'aaa' },
      { name: 'dir/b.txt', content: 'bbb' }
    ]);

    const root = {
      rootId: 'r:2',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const archiveLayers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
    ];
    const archiveRoot = { rootId: root.rootId, layers: archiveLayers, vpath: '/' };
    const children = await vfs.listChildren(archiveRoot);
    const names = children.map((ref) => ref.vpath).sort();
    expect(names).toEqual(['/a.txt', '/dir']);

    const entryRef = { rootId: root.rootId, layers: archiveLayers, vpath: '/a.txt' };
    const stat = await vfs.stat(entryRef);
    expect(stat.kind).toBe(NodeKind.FILE);
    expect(stat.size).toBe(3);

    const stream = await vfs.openReadRange(entryRef, 0, 3);
    const buffer = await readStreamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('aaa');
  });

  it('stats archive root when entry is missing', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'archive.zip');
    await createZip(zipPath, [{ name: 'a.txt', content: 'aaa' }]);

    const root = {
      rootId: 'r:3',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const archiveLayers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
    ];
    const archiveRoot = { rootId: root.rootId, layers: archiveLayers, vpath: '/' };
    const stat = await vfs.stat(archiveRoot);
    expect(stat.kind).toBe(NodeKind.DIR);
  });

  it('lists archive children under nested prefixes', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'archive.zip');
    await createZip(zipPath, [{ name: 'dir/b.txt', content: 'bbb' }]);

    const root = {
      rootId: 'r:4',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const archiveLayers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
    ];
    const dirRef = { rootId: root.rootId, layers: archiveLayers, vpath: '/dir' };
    const children = await vfs.listChildren(dirRef);
    expect(children.map((ref) => ref.vpath)).toEqual(['/dir/b.txt']);
  });

  it('reads nested archives through multiple layers', async () => {
    const dir = createTempDir();
    const innerZipPath = path.join(dir, 'inner.zip');
    await createZip(innerZipPath, [{ name: 'inner.txt', content: 'inside' }]);
    const innerBuffer = fs.readFileSync(innerZipPath);

    const outerZipPath = path.join(dir, 'outer.zip');
    const outerZip = new yazl.ZipFile();
    outerZip.addBuffer(innerBuffer, 'inner.zip');
    outerZip.end();
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(outerZipPath);
      outerZip.outputStream.pipe(out);
      out.on('close', () => resolve());
      out.on('error', reject);
    });

    const root = {
      rootId: 'r:5',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const layers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/outer.zip' },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/inner.zip' }
    ];
    const entryRef = { rootId: root.rootId, layers, vpath: '/inner.txt' };
    const stream = await vfs.openReadRange(entryRef, 0, 6);
    const buffer = await readStreamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('inside');
  });

  it('uses openEntryRange when available', async () => {
    const dir = createTempDir();
    const root = {
      rootId: 'r:6',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const reader = new StubArchiveReader();
    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([reader]));
    const layers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'stub', containerVPath: '/container.stub' }
    ];
    const ref = { rootId: root.rootId, layers, vpath: '/data.txt' };
    const stream = await vfs.openReadRange(ref, 0, 4);
    const buffer = await readStreamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('data');
    expect(reader.rangeCalled).toBe(true);
  });

  it('throws for unsupported archive formats', async () => {
    const dir = createTempDir();
    const root = {
      rootId: 'r:7',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const vfs = new DefaultVfs({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const layers = [
      { kind: LayerKind.OS, rootId: root.rootId },
      { kind: LayerKind.ARCHIVE, format: 'rar', containerVPath: '/archive.rar' }
    ];
    await expect(vfs.stat({ rootId: root.rootId, layers, vpath: '/file' } as any)).rejects.toThrow('Unsupported archive format');
  });
});
