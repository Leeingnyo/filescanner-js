import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileExecutor } from '../../../src/ops/FileExecutor.js';
import { ArchiveRegistry } from '../../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../../src/archive/zip/ZipArchiveReader.js';
import { ConflictPolicy, OpType } from '../../../src/types/operations.js';
import { CasePolicy, OsKind } from '../../../src/types/enums.js';
import { LayerKind } from '../../../src/types/layers.js';
import yazl from 'yazl';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exec-'));
}

describe('FileExecutor', () => {
  it('copies with rename on conflict', async () => {
    const dir = tempDir();
    const srcPath = path.join(dir, 'src.txt');
    const dstPath = path.join(dir, 'dst.txt');
    fs.writeFileSync(srcPath, 'source');
    fs.writeFileSync(dstPath, 'existing');

    const root = {
      rootId: 'r:1',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const plan = {
      planId: 'p:1',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:1',
          type: OpType.COPY,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src.txt' },
          dst: { rootId: root.rootId, vpath: '/dst.txt' },
          policy: { conflict: ConflictPolicy.RENAME }
        }
      ]
    };

    const dry = await executor.dryRun(plan);
    expect(dry.preflight?.conflicts.length).toBe(0);

    await executor.execute(plan, {
      onStarted: () => {},
      onOpStarted: () => {},
      onOpFinished: () => {},
      onError: () => {},
      onFinished: () => {}
    });

    expect(fs.existsSync(path.join(dir, 'dst (1).txt'))).toBe(true);
  });

  it('reports preflight conflicts and missing sources', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'exists.txt'), 'existing');
    fs.mkdirSync(path.join(dir, 'existing'));

    const root = {
      rootId: 'r:1b',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const plan = {
      planId: 'p:preflight',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:missing',
          type: OpType.COPY,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/missing.txt' },
          dst: { rootId: root.rootId, vpath: '/exists.txt' },
          policy: { conflict: ConflictPolicy.OVERWRITE }
        },
        {
          opId: 'op:mkdir',
          type: OpType.MKDIR,
          dst: { rootId: root.rootId, vpath: '/existing' },
          policy: { conflict: ConflictPolicy.SKIP }
        }
      ]
    };

    const dry = await executor.dryRun(plan);
    expect(dry.preflight?.missingSources).toContain('op:missing');
    expect(dry.preflight?.conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('creates directories and deletes files', async () => {
    const dir = tempDir();
    const root = {
      rootId: 'r:2',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    fs.writeFileSync(path.join(dir, 'todelete.txt'), 'remove');

    const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const plan = {
      planId: 'p:2',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:mkdir',
          type: OpType.MKDIR,
          dst: { rootId: root.rootId, vpath: '/new/dir' },
          policy: { conflict: ConflictPolicy.SKIP }
        },
        {
          opId: 'op:delete',
          type: OpType.DELETE,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/todelete.txt' },
          policy: { conflict: ConflictPolicy.SKIP }
        }
      ]
    };

    await executor.execute(plan, {
      onStarted: () => {},
      onOpStarted: () => {},
      onOpFinished: () => {},
      onError: () => {},
      onFinished: () => {}
    });

    expect(fs.existsSync(path.join(dir, 'new', 'dir'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'todelete.txt'))).toBe(false);
  });

  it('moves files to new destinations', async () => {
    const dir = tempDir();
    const root = {
      rootId: 'r:3',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    fs.writeFileSync(path.join(dir, 'move.txt'), 'move');

    const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const plan = {
      planId: 'p:3',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:move',
          type: OpType.MOVE,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/move.txt' },
          dst: { rootId: root.rootId, vpath: '/moved/move.txt' },
          policy: { conflict: ConflictPolicy.OVERWRITE }
        }
      ]
    };

    await executor.execute(plan, {
      onStarted: () => {},
      onOpStarted: () => {},
      onOpFinished: () => {},
      onError: () => {},
      onFinished: () => {}
    });

    expect(fs.existsSync(path.join(dir, 'move.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'moved', 'move.txt'))).toBe(true);
  });

  it('skips and fails conflicts based on policy', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'src.txt'), 'source');
    fs.writeFileSync(path.join(dir, 'dst.txt'), 'existing');

    const root = {
      rootId: 'r:4',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
    const plan = {
      planId: 'p:conflict',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:skip',
          type: OpType.COPY,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src.txt' },
          dst: { rootId: root.rootId, vpath: '/dst.txt' },
          policy: { conflict: ConflictPolicy.SKIP }
        },
        {
          opId: 'op:fail',
          type: OpType.COPY,
          src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src.txt' },
          dst: { rootId: root.rootId, vpath: '/dst.txt' },
          policy: { conflict: ConflictPolicy.FAIL }
        }
      ]
    };

    const { report } = await executor.execute(plan, {
      onStarted: () => {},
      onOpStarted: () => {},
      onOpFinished: () => {},
      onError: () => {},
      onFinished: () => {}
    });

    expect(report.results.find((r) => r.opId === 'op:skip')?.status).toBe('SKIPPED');
    expect(report.results.find((r) => r.opId === 'op:fail')?.status).toBe('FAILED');
    expect(fs.readFileSync(path.join(dir, 'dst.txt'), 'utf8')).toBe('existing');
  });

  it('copies from archive sources', async () => {
    const dir = tempDir();
    const zipPath = path.join(dir, 'archive.zip');
    const zip = new ZipArchiveReader();
    const registry = new ArchiveRegistry([zip]);
    const root = {
      rootId: 'r:5',
      rootKey: 'posixpath:/tmp',
      os: OsKind.POSIX,
      osPath: dir,
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };

    const zipWriter = new yazl.ZipFile();
    zipWriter.addBuffer(Buffer.from('from-zip', 'utf8'), 'file.txt');
    zipWriter.end();
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(zipPath);
      zipWriter.outputStream.pipe(out);
      out.on('close', () => resolve());
      out.on('error', reject);
    });

    const executor = new FileExecutor({ getRoot: () => root }, registry);
    const plan = {
      planId: 'p:archive',
      createdAt: new Date().toISOString(),
      ops: [
        {
          opId: 'op:copy-archive',
          type: OpType.COPY,
          src: {
            rootId: root.rootId,
            layers: [
              { kind: LayerKind.OS, rootId: root.rootId },
              { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
            ],
            vpath: '/file.txt'
          },
          dst: { rootId: root.rootId, vpath: '/out.txt' },
          policy: { conflict: ConflictPolicy.OVERWRITE }
        }
      ]
    };

    await executor.execute(plan, {
      onStarted: () => {},
      onOpStarted: () => {},
      onOpFinished: () => {},
      onError: () => {},
      onFinished: () => {}
    });

    expect(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8')).toBe('from-zip');
  });
});
