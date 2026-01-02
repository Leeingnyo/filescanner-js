import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { FileSystemScanner } from '../../../src/scanner/FileSystemScanner.js';
import { ArchiveRegistry } from '../../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../../src/archive/zip/ZipArchiveReader.js';
import { CasePolicy, OsKind, NodeKind, IdentityPlatform, ErrorCode } from '../../../src/types/enums.js';
import { ScopeMode } from '../../../src/types/scan.js';
import { ErrorPolicy, SymlinkPolicy } from '../../../src/types/scanPolicy.js';
import type { ScanRequest } from '../../../src/types/scanRequest.js';
import { toCanonicalString } from '../../../src/node/canonical.js';

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
  const itPosix = process.platform === 'win32' ? it.skip : it;

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

  it('prunes ignored directories using regex rules', async () => {
    const dir = createTempDir();
    fs.mkdirSync(path.join(dir, 'skipdir'));
    fs.writeFileSync(path.join(dir, 'skipdir', 'inner.txt'), 'skip');
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'ok');

    const root = {
      rootId: 'r:4',
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
      ignore: { glob: [], regex: ['^/skipdir($|/)'] },
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

    expect(nodes).toContain('/keep.txt');
    expect(nodes).not.toContain('/skipdir');
    expect(nodes).not.toContain('/skipdir/inner.txt');
  });

  itPosix('captures POSIX identity when supported', async () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'id.txt'), 'id');

    const root = {
      rootId: 'r:3',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: true }
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
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const nodes: { vpath: string; identity: { platform: IdentityPlatform; isAvailable: boolean; posix?: { dev: number; inode: number } } }[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: (batch) => {
          for (const node of batch) nodes.push({ vpath: node.ref.vpath, identity: node.identity });
        },
        onError: () => {},
        onRunFinished: () => resolve()
      });
    });

    const file = nodes.find((node) => node.vpath === '/id.txt');
    expect(file).toBeTruthy();
    expect(file?.identity.isAvailable).toBe(true);
    expect(file?.identity.platform).toBe(IdentityPlatform.POSIX);
    expect(file?.identity.posix?.dev).toBeTypeOf('number');
    expect(file?.identity.posix?.inode).toBeTypeOf('number');
  });

  const itSymlink = process.platform === 'win32' ? it.skip : it;

  itSymlink('follows safe symlinks within the root', async () => {
    const dir = createTempDir();
    fs.mkdirSync(path.join(dir, 'target'));
    fs.writeFileSync(path.join(dir, 'target', 'inside.txt'), 'inside');
    fs.symlinkSync(path.join(dir, 'target'), path.join(dir, 'link'));

    const root = {
      rootId: 'r:5',
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
        symlinkPolicy: SymlinkPolicy.FOLLOW_SAFE,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
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

    expect(nodes).toContain('/link/inside.txt');
  });

  const itPermissions = process.platform === 'win32' ? it.skip : it;

  itPermissions('marks run failed on FAIL_FAST errors', async () => {
    const dir = createTempDir();
    const locked = path.join(dir, 'locked');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o000);

    const root = {
      rootId: 'r:6',
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
        errorPolicy: ErrorPolicy.FAIL_FAST,
        symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    let status: string | undefined;
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: () => {},
        onError: () => {},
        onRunFinished: (run) => {
          status = run.status;
          resolve();
        }
      });
    });

    fs.chmodSync(locked, 0o755);
    expect(status).toBe('FAILED');
  });

  it('emits error nodes for missing paths', async () => {
    const dir = createTempDir();
    const root = {
      rootId: 'r:8',
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
      scopes: [{ baseVPath: '/missing.txt', mode: ScopeMode.SINGLE_NODE }],
      policy: {
        errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
        symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const nodes: string[] = [];
    const errors: any[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: (batch) => {
          for (const node of batch) nodes.push(node.ref.vpath);
        },
        onError: (err) => errors.push(err),
        onRunFinished: () => resolve()
      });
    });

    expect(nodes).toContain('/missing.txt');
    expect(errors.some((err) => err.code === ErrorCode.NOT_FOUND)).toBe(true);
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

  it('scans nested archives when enabled', async () => {
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
      rootId: 'r:7',
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
        archivePolicy: { includeArchives: true, formats: ['zip'], maxNesting: 3, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
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

    expect(canon).toContain(`root:${root.rootId}:/outer.zip!/inner.zip!/`);
    expect(canon).toContain(`root:${root.rootId}:/outer.zip!/inner.zip!/inner.txt`);
  });

  itSymlink('does not follow symlinks that escape the root', async () => {
    const dir = createTempDir();
    const outside = createTempDir();
    fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
    fs.symlinkSync(outside, path.join(dir, 'link'));

    const root = {
      rootId: 'r:9',
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
        symlinkPolicy: SymlinkPolicy.FOLLOW_SAFE,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
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

    expect(nodes).toContain('/link');
    expect(nodes).not.toContain('/link/outside.txt');
  });

  it('records archive entry errors during scan', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'bad.zip');
    await createZip(zipPath, [
      { name: 'a//b.txt', content: 'bad' },
      { name: 'ok.txt', content: 'ok' }
    ]);

    const root = {
      rootId: 'r:10',
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
        archivePolicy: { includeArchives: true, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const errors: any[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: () => {},
        onError: (err) => errors.push(err),
        onRunFinished: () => resolve()
      });
    });

    expect(errors.some((err) => err.code === ErrorCode.INVALID_VPATH_FORMAT)).toBe(true);
  });

  it('reports archive open failures', async () => {
    const dir = createTempDir();
    const zipPath = path.join(dir, 'broken.zip');
    fs.writeFileSync(zipPath, 'not a zip');

    const root = {
      rootId: 'r:11',
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
        archivePolicy: { includeArchives: true, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    const errors: any[] = [];
    await new Promise<void>((resolve) => {
      scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: () => {},
        onError: (err) => errors.push(err),
        onRunFinished: () => resolve()
      });
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('cancels scans and marks remaining scopes partial', async () => {
    const dir = createTempDir();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    const root = {
      rootId: 'r:12',
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
      scopes: [
        { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
        { baseVPath: '/a.txt', mode: ScopeMode.SINGLE_NODE }
      ],
      policy: {
        errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
        symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
        archivePolicy: { includeArchives: false, formats: ['zip'], maxNesting: 1, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
      },
      ignore: { glob: [], regex: [] },
      concurrency: { io: 1, cpu: 1 }
    };

    let finishedRun: any;
    let finishedCoverage: any;
    await new Promise<void>((resolve) => {
      const { control } = scanner.startScan(request, {
        onRunStarted: () => {},
        onNodes: () => {},
        onError: () => {},
        onRunFinished: (run, coverage) => {
          finishedRun = run;
          finishedCoverage = coverage;
          resolve();
        }
      });
      control.cancel();
    });

    expect(finishedRun.status).toBe('CANCELED');
    expect(finishedCoverage.scopes.every((scope: any) => scope.completeness === 'PARTIAL')).toBe(true);
  });
});
