import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { FileSystemScanner } from '../../src/scanner/FileSystemScanner.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { CasePolicy, OsKind, NodeKind } from '../../src/types/enums.js';
import { ScopeMode } from '../../src/types/scan.js';
import { ErrorPolicy, SymlinkPolicy } from '../../src/types/scanPolicy.js';
import type { ScanRequest } from '../../src/types/scanRequest.js';
import { toCanonicalString } from '../../src/node/canonical.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fs-scan-'));
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

describe('FileSystemScanner', () => {
  it('respects ignore rules and scope', async () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'ok');
    fs.writeFileSync(path.join(dir, 'skip.ignore'), 'no');
    fs.mkdirSync(path.join(dir, 'dir'));
    fs.writeFileSync(path.join(dir, 'dir', 'child.txt'), 'child');
    fs.mkdirSync(path.join(dir, 'skipdir'));
    fs.writeFileSync(path.join(dir, 'skipdir', 'inner.txt'), 'skip');

    const root = {
      rootId: 'r:1',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const scanner = new FileSystemScanner({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const request: ScanRequest = {
      snapshotId: 's:1',
      rootId: root.rootId,
      scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
      policy: {
        errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
        symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: ['*.ignore', '/skipdir/**'], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const nodes: string[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: (batch) => {
          for (const node of batch) nodes.push(node.ref.vpath);
        },
        onError: () => {},
        onRunFinished: () => resolve()
      });
    });

    expect(nodes).toContain('/');
    expect(nodes).toContain('/keep.txt');
    expect(nodes).toContain('/dir');
    expect(nodes).toContain('/dir/child.txt');
    expect(nodes).not.toContain('/skip.ignore');
    expect(nodes).not.toContain('/skipdir');
    expect(nodes).not.toContain('/skipdir/inner.txt');
  });

  it('scans archives when enabled', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'archive.zip');
    await createZip(zipPath, [{ name: 'a.txt', content: 'hello' }]);

    const root = {
      rootId: 'r:2',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const scanner = new FileSystemScanner({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const request: ScanRequest = {
      snapshotId: 's:1',
      rootId: root.rootId,
      scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
      policy: {
        errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
        symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
        archivePolicy: { includeArchives: true, formats: ['zip'], maxNesting: 2, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const canon: string[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: (batch) => {
          for (const node of batch) canon.push(toCanonicalString(node.ref));
        },
        onError: () => {},
        onRunFinished: () => resolve()
      });
    });

    expect(canon).toContain(`root:${root.rootId}:/archive.zip`);
    expect(canon).toContain(`root:${root.rootId}:/archive.zip!/`);
    expect(canon).toContain(`root:${root.rootId}:/archive.zip!/a.txt`);
  });
});
