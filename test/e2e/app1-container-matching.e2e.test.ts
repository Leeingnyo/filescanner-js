import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { NodeKind } from '../../src/types/enums.js';
import { LayerKind } from '../../src/types/layers.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, createZip } from './helpers.js';

// E2E: App1 scenario from the conversation.
// - foo has directories: others/, backup/, baz/ (each with a .txt file)
// - bar has directories: others/, backup/ plus backup.zip and baz.zip
// - zip contents are the same as the corresponding directories in foo
//
// The app logic is:
// 1) Run a raw diff to find "obvious" differences.
// 2) If a zip exists, look for a same-name directory and compare subtree contents.
// 3) Use compareSubtree to mark "content equal" even when containers differ.
describe('E2E App1 container matching', () => {
  it('detects container differences and confirms equal contents via compareSubtree', async () => {
    // --- Step 1: build filesystem fixtures (programmatic, minimal, deterministic) ---
    const baseDir = createTempDir('e2e-app1-');
    const fooDir = path.join(baseDir, 'foo');
    const barDir = path.join(baseDir, 'bar');
    fs.mkdirSync(fooDir, { recursive: true });
    fs.mkdirSync(barDir, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      // Use a shared top-level folder to avoid the "/" prefix edge case in sqlite queries.
      const fooRoot = path.join(fooDir, 'root');
      const barRoot = path.join(barDir, 'root');
      fs.mkdirSync(fooRoot, { recursive: true });
      fs.mkdirSync(barRoot, { recursive: true });

      // foo fixtures
      fs.mkdirSync(path.join(fooRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'backup'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'baz'), { recursive: true });
      fs.writeFileSync(path.join(fooRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(fooRoot, 'backup', 'A.txt'), 'A');
      fs.writeFileSync(path.join(fooRoot, 'baz', 'C.txt'), 'C');

      // bar fixtures (folders + archives)
      fs.mkdirSync(path.join(barRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'backup'), { recursive: true });
      fs.writeFileSync(path.join(barRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(barRoot, 'backup', 'A.txt'), 'A');
      await createZip(path.join(barRoot, 'backup.zip'), [{ name: 'A.txt', content: 'A' }]);
      await createZip(path.join(barRoot, 'baz.zip'), [{ name: 'C.txt', content: 'C' }]);

      // --- Step 2: scan into sqlite snapshots (include archives) ---
      store = createSqliteStore(baseDir);
      const rootFoo = makeRoot('r:foo', fooDir);
      const rootBar = makeRoot('r:bar', barDir);
      store.registerRoot(rootFoo);
      store.registerRoot(rootBar);

      const snapFoo = store.createSnapshot(rootFoo.rootId);
      const snapBar = store.createSnapshot(rootBar.rootId);
      await scanAndPersist({ store, root: rootFoo, snapshotId: snapFoo.snapshotId, scopes: [{ baseVPath: '/root', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });
      await scanAndPersist({ store, root: rootBar, snapshotId: snapBar.snapshotId, scopes: [{ baseVPath: '/root', mode: ScopeMode.FULL_SUBTREE }], includeArchives: true });

      // --- Step 3: raw diff (OS layer only) ---
      // This represents the “diff only view” before App1’s container matching.
      const comparer = new DefaultComparer(store);
      const rawDiff = comparer.compare(snapFoo.snapshotId, snapBar.snapshotId, {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/root', mode: ScopeMode.FULL_SUBTREE },
        identity: {
          strategies: [
            { type: EvidenceType.VPATH, weight: 1 },
            { type: EvidenceType.SIZE, weight: 1 }
          ],
          conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
          thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
          casePolicy: 'SENSITIVE'
        },
        move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
        requireObservedCoverage: true
      });

      const diffPaths = rawDiff.entries.map((entry) => entry.path).sort();

      // "others" should not appear in diff because it is identical in both roots.
      expect(diffPaths.some((p) => p.startsWith('/others'))).toBe(false);

      // The archive containers should show up as ADDED in bar.
      expect(diffPaths).toContain('/backup.zip');
      expect(diffPaths).toContain('/baz.zip');

      // foo has /baz while bar has baz.zip; we expect a removed entry under /baz.
      expect(diffPaths.some((p) => p.startsWith('/baz'))).toBe(true);

      // --- Step 4: App1-style container matching (archive-driven) ---
      // We only look for containers where a zip exists.
      // For each zip, we check if a same-name directory exists on either side
      // and compare subtree contents using compareSubtree.
      const fooNodes = store.queryNodes(snapFoo.snapshotId, { filter: { vpathPrefix: '/root' } }).nodes;
      const barNodes = store.queryNodes(snapBar.snapshotId, { filter: { vpathPrefix: '/root' } }).nodes;

      // Index directories by vpath for quick lookup.
      const fooDirs = new Set(fooNodes.filter((n) => n.kind === NodeKind.DIR && n.ref.layers.length === 1).map((n) => n.ref.vpath));
      const barDirs = new Set(barNodes.filter((n) => n.kind === NodeKind.DIR && n.ref.layers.length === 1).map((n) => n.ref.vpath));

      // Collect zip containers from bar (archive-driven approach).
      const barZips = barNodes
        .filter((n) => n.kind === NodeKind.FILE && n.ref.layers.length === 1 && n.name.toLowerCase().endsWith('.zip'))
        .map((n) => n.ref.vpath);

      // Helper: derive container key from "/root/backup.zip" -> "/root/backup".
      const containerKeyFromZip = (zipVPath: string) => zipVPath.replace(/\.zip$/i, '');

      // For each zip in bar, compare with any matching directory in foo and bar.
      const containerComparisons: Array<{ container: string; fooVsBarZip: boolean; barDirVsZip: boolean }> = [];
      for (const zipVPath of barZips) {
        const containerKey = containerKeyFromZip(zipVPath);
        const fileName = containerKey.endsWith('/backup') ? '/A.txt' : '/C.txt';

        const fooHasDir = fooDirs.has(containerKey);
        const barHasDir = barDirs.has(containerKey);

        let fooVsBarZip = false;
        let barDirVsZip = false;

        if (fooHasDir) {
          // Compare foo’s directory against bar’s zip contents at a single file node.
          const baseFoo = { rootId: rootFoo.rootId, layers: [{ kind: LayerKind.OS, rootId: rootFoo.rootId }], vpath: containerKey };
          const baseBarZip = {
            rootId: rootBar.rootId,
            layers: [
              { kind: LayerKind.OS, rootId: rootBar.rootId },
              { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: zipVPath }
            ],
            vpath: '/'
          };
          const compare = comparer.compareSubtree(
            snapFoo.snapshotId,
            baseFoo as any,
            snapBar.snapshotId,
            baseBarZip as any,
            {
              mode: CompareMode.STRICT,
              scope: { baseVPath: fileName, mode: ScopeMode.SINGLE_NODE },
              identity: {
                strategies: [
                  { type: EvidenceType.VPATH, weight: 1 },
                  { type: EvidenceType.SIZE, weight: 1 }
                ],
                conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
                thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
                casePolicy: 'SENSITIVE'
              },
              move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
              requireObservedCoverage: true
            }
          );
          fooVsBarZip = compare.summary.modified === 0 && compare.summary.added === 0 && compare.summary.removed === 0;
        }

        if (barHasDir) {
          // Compare bar’s directory against its own zip (duplicate container).
          const baseBarDir = { rootId: rootBar.rootId, layers: [{ kind: LayerKind.OS, rootId: rootBar.rootId }], vpath: containerKey };
          const baseBarZip = {
            rootId: rootBar.rootId,
            layers: [
              { kind: LayerKind.OS, rootId: rootBar.rootId },
              { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: zipVPath }
            ],
            vpath: '/'
          };
          const compare = comparer.compareSubtree(
            snapBar.snapshotId,
            baseBarDir as any,
            snapBar.snapshotId,
            baseBarZip as any,
            {
              mode: CompareMode.STRICT,
              scope: { baseVPath: fileName, mode: ScopeMode.SINGLE_NODE },
              identity: {
                strategies: [
                  { type: EvidenceType.VPATH, weight: 1 },
                  { type: EvidenceType.SIZE, weight: 1 }
                ],
                conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
                thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
                casePolicy: 'SENSITIVE'
              },
              move: { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE },
              requireObservedCoverage: true
            }
          );
          barDirVsZip = compare.summary.modified === 0 && compare.summary.added === 0 && compare.summary.removed === 0;
        }

        containerComparisons.push({ container: containerKey, fooVsBarZip, barDirVsZip });
      }

      // --- Step 5: Assertions that reflect the App1 scenario ---
      const backup = containerComparisons.find((c) => c.container.endsWith('/backup'));
      const baz = containerComparisons.find((c) => c.container.endsWith('/baz'));

      // backup: foo dir vs bar zip is equivalent (green indicator).
      expect(backup?.fooVsBarZip).toBe(true);
      // backup: bar dir vs bar zip are equivalent (duplicate container resolved).
      expect(backup?.barDirVsZip).toBe(true);

      // baz: foo dir vs bar zip is equivalent (green indicator).
      expect(baz?.fooVsBarZip).toBe(true);
      // baz: bar has no baz dir, so duplicate comparison is false by design.
      expect(baz?.barDirVsZip).toBe(false);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
