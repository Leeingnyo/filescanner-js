import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { ZipArchiveReader } from '../../../src/archive/zip/ZipArchiveReader.js';
import { readStreamToBuffer } from '../../../src/utils/streams.js';

function createZip(entries: { name: string; content: string }[]): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-scan-'));
  const zipPath = path.join(dir, 'test.zip');
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content, 'utf8'), entry.name);
  }
  zip.end();
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    zip.outputStream.pipe(out);
    out.on('close', () => resolve(zipPath));
    out.on('error', reject);
  });
}

describe('ZipArchiveReader', () => {
  it('lists entries and opens streams', async () => {
    const zipPath = await createZip([
      { name: 'b.txt', content: 'b' },
      { name: 'a.txt', content: 'a' },
      { name: 'dir/c.txt', content: 'c' }
    ]);

    const reader = new ZipArchiveReader();
    const handle = await reader.open({ path: zipPath }, 'zip');
    const entries = Array.from(handle.listEntries('/')).map((e) => e.entryVPath);
    expect(entries).toEqual(['/a.txt', '/b.txt', '/dir/c.txt']);

    const stream = await handle.openEntryStream('/a.txt');
    const buffer = await readStreamToBuffer(stream);
    expect(buffer.toString('utf8')).toBe('a');
    handle.close();
  });

  it('opens from buffer and stream sources', async () => {
    const zipPath = await createZip([{ name: 'a.txt', content: 'a' }, { name: 'dir/b.txt', content: 'b' }]);
    const reader = new ZipArchiveReader();

    const buffer = fs.readFileSync(zipPath);
    const bufferHandle = await reader.open({ buffer }, 'zip');
    const prefixed = Array.from(bufferHandle.listEntries('/dir')).map((e) => e.entryVPath);
    expect(prefixed).toEqual(['/dir/b.txt']);
    bufferHandle.close();

    const streamHandle = await reader.open({ stream: fs.createReadStream(zipPath) }, 'zip');
    expect(() => streamHandle.statEntry('/missing.txt')).toThrow('Entry not found');
    streamHandle.close();
  });

  it('captures invalid entry errors and skips traversal', async () => {
    const zipPath = await createZip([
      { name: 'a//b.txt', content: 'bad' },
      { name: 'ok.txt', content: 'ok' }
    ]);
    const reader = new ZipArchiveReader();
    const errors: Error[] = [];
    const handle = await reader.open({ path: zipPath }, 'zip', {
      onError: (err) => errors.push(err)
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(handle.errors.length).toBeGreaterThan(0);
    const entries = Array.from(handle.listEntries('/')).map((e) => e.entryVPath);
    expect(entries).toContain('/ok.txt');
    handle.close();
  });

  it('rejects unsupported container sources', async () => {
    const reader = new ZipArchiveReader();
    await expect(reader.open({} as any, 'zip')).rejects.toThrow('Unsupported container source');
  });
});
