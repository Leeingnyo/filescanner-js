import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileExecutor } from '../../src/ops/FileExecutor.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { ConflictPolicy, OpType } from '../../src/types/operations.js';
import { CasePolicy, OsKind } from '../../src/types/enums.js';
import { LayerKind } from '../../src/types/layers.js';

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
});
