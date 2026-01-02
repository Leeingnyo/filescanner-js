import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FileExecutor } from '../../src/ops/FileExecutor.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { ConflictPolicy, OpType } from '../../src/types/operations.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, makeRoot } from './helpers.js';

// E2E: Execute real filesystem operations with conflict policies.
// This test validates SKIP/RENAME/FAIL/OVERWRITE behavior end-to-end.
describe('E2E ops execution with conflict policies', () => {
  it('executes operations and reports conflict outcomes', async () => {
    // Step 1: create a temp workspace for this test.
    const baseDir = createTempDir('e2e-ops-');

    try {
      // Step 2: prepare sources and destinations with known content.
      fs.writeFileSync(path.join(baseDir, 'src1.txt'), 'source-1');
      fs.writeFileSync(path.join(baseDir, 'src2.txt'), 'source-2');
      fs.writeFileSync(path.join(baseDir, 'dst-rename.txt'), 'existing');
      fs.writeFileSync(path.join(baseDir, 'dst-skip.txt'), 'existing');
      fs.writeFileSync(path.join(baseDir, 'dst-fail.txt'), 'existing');
      fs.writeFileSync(path.join(baseDir, 'dst-overwrite.txt'), 'existing');

      // Step 3: create the root descriptor and executor.
      const root = makeRoot('r:ops', baseDir);
      const executor = new FileExecutor({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));

      // Step 4: define a plan covering multiple conflict policies.
      const plan = {
        planId: 'plan:e2e',
        createdAt: new Date().toISOString(),
        ops: [
          {
            opId: 'copy-rename',
            type: OpType.COPY,
            src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src1.txt' },
            dst: { rootId: root.rootId, vpath: '/dst-rename.txt' },
            policy: { conflict: ConflictPolicy.RENAME }
          },
          {
            opId: 'copy-skip',
            type: OpType.COPY,
            src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src1.txt' },
            dst: { rootId: root.rootId, vpath: '/dst-skip.txt' },
            policy: { conflict: ConflictPolicy.SKIP }
          },
          {
            opId: 'copy-fail',
            type: OpType.COPY,
            src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src1.txt' },
            dst: { rootId: root.rootId, vpath: '/dst-fail.txt' },
            policy: { conflict: ConflictPolicy.FAIL }
          },
          {
            opId: 'move-overwrite',
            type: OpType.MOVE,
            src: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: '/src2.txt' },
            dst: { rootId: root.rootId, vpath: '/dst-overwrite.txt' },
            policy: { conflict: ConflictPolicy.OVERWRITE }
          }
        ]
      };

      // Step 5: execute the plan and capture results.
      const { report } = await executor.execute(plan, {
        onStarted: () => {},
        onOpStarted: () => {},
        onOpFinished: () => {},
        onError: () => {},
        onFinished: () => {}
      });

      // Step 6: validate outcomes in the report.
      expect(report.results.find((r) => r.opId === 'copy-rename')?.status).toBe('OK');
      expect(report.results.find((r) => r.opId === 'copy-skip')?.status).toBe('SKIPPED');
      expect(report.results.find((r) => r.opId === 'copy-fail')?.status).toBe('FAILED');
      expect(report.results.find((r) => r.opId === 'move-overwrite')?.status).toBe('OK');

      // Step 7: validate filesystem results.
      expect(fs.existsSync(path.join(baseDir, 'dst-rename (1).txt'))).toBe(true);
      expect(fs.readFileSync(path.join(baseDir, 'dst-skip.txt'), 'utf8')).toBe('existing');
      expect(fs.readFileSync(path.join(baseDir, 'dst-fail.txt'), 'utf8')).toBe('existing');
      expect(fs.readFileSync(path.join(baseDir, 'dst-overwrite.txt'), 'utf8')).toBe('source-2');
      expect(fs.existsSync(path.join(baseDir, 'src2.txt'))).toBe(false);
    } finally {
      // Always clean up the temp tree so tests can run in parallel.
      cleanupTempDir(baseDir);
    }
  });
});
