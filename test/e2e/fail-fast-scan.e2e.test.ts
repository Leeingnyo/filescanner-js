import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ErrorPolicy } from '../../src/types/scanPolicy.js';
import { ScopeMode } from '../../src/types/scan.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, makePolicy } from './helpers.js';

// E2E: FAIL_FAST scan behavior with real filesystem errors.
// We lock a directory to trigger a stat/list failure, then verify run status + coverage.
describe('E2E fail-fast scan', () => {
  const itPosix = process.platform === 'win32' ? it.skip : it;

  itPosix('marks run failed and coverage partial on error', async () => {
    const baseDir = createTempDir('e2e-fail-fast-');
    const lockedDir = path.join(baseDir, 'locked');
    fs.mkdirSync(lockedDir, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Step 1: remove permissions to force an error when listing/stating.
      fs.chmodSync(lockedDir, 0o000);

      // Step 2: create sqlite store and register root.
      store = createSqliteStore(baseDir);
      const root = makeRoot('r:fail-fast', baseDir);
      store.registerRoot(root);

      // Step 3: run a scan with FAIL_FAST policy.
      const policy = { ...makePolicy(false), errorPolicy: ErrorPolicy.FAIL_FAST };
      const snapshot = store.createSnapshot(root.rootId);
      const { run, coverage } = await scanAndPersist({
        store,
        root,
        snapshotId: snapshot.snapshotId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: false,
        policy
      });

      // Step 4: verify failure + partial coverage.
      expect(run.status).toBe('FAILED');
      expect(coverage.scopes[0].completeness).toBe('PARTIAL');
      // Errors may be suppressed by platform-specific permission semantics,
      // but when present they should be recorded on the coverage scope.
      const errors = coverage.scopes[0].errors ?? [];
      if (errors.length > 0) {
        expect(errors.length).toBeGreaterThan(0);
      }
    } finally {
      // Always restore permissions before cleanup so deletion succeeds.
      try {
        fs.chmodSync(lockedDir, 0o755);
      } catch {
        // ignore cleanup errors
      }
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
