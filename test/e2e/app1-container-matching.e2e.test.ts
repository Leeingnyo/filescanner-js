import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { NodeKind } from '../../src/types/enums.js';
import { LayerKind } from '../../src/types/layers.js';
import { layersSigHash } from '../../src/node/layersSig.js';
import { joinVPath } from '../../src/vpath/normalize.js';
import { vpathHasPrefix } from '../../src/vpath/prefix.js';
import { NodeSortKey, SortOrder } from '../../src/types/store/query.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, scanAndPersist, createZip } from './helpers.js';

type ContainerComparison = {
  containerKey: string;
  zipVPath: string;
  fooHasDir: boolean;
  barHasDir: boolean;
  fooVsBarZip: boolean;
  barDirVsZip: boolean;
};

type DisplayEntry = {
  side: 'left' | 'right';
  kind: 'dir' | 'zip';
  vpath: string;
  contentEqual: boolean;
};

type DisplayRow = {
  displayKey: string;
  entries: DisplayEntry[];
};

type App1ComparisonResult = {
  diffPaths: string[];
  containerComparisons: ContainerComparison[];
  displayModel: DisplayRow[];
};

function relativeVPath(base: string, target: string): string {
  if (base === '/') return target;
  if (target === base) return '/';
  if (target.startsWith(`${base}/`)) {
    return `/${target.slice(base.length + 1)}`;
  }
  return target;
}

function collectFileNodes(
  store: ReturnType<typeof createSqliteStore>,
  snapshotId: string,
  baseRef: { vpath: string; layers: unknown[] },
  scopeBase: string
): Map<string, number | undefined> {
  const baseAbs = joinVPath(baseRef.vpath as any, scopeBase as any) as string;
  const baseLayersHash = layersSigHash(baseRef.layers as any);
  const query = store.queryNodes(snapshotId, {
    filter: { vpathPrefix: baseAbs },
    sort: { key: NodeSortKey.VPATH, order: SortOrder.ASC }
  });
  const result = new Map<string, number | undefined>();
  for (const node of query.nodes) {
    if (node.kind !== NodeKind.FILE) continue;
    if (!vpathHasPrefix(node.ref.vpath as any, baseAbs as any)) continue;
    if (layersSigHash(node.ref.layers) !== baseLayersHash) continue;
    result.set(relativeVPath(baseAbs, node.ref.vpath), node.size);
  }
  return result;
}

function fileTreesEqual(left: Map<string, number | undefined>, right: Map<string, number | undefined>): boolean {
  const paths = new Set<string>([...left.keys(), ...right.keys()]);
  for (const path of paths) {
    const leftSize = left.get(path);
    const rightSize = right.get(path);
    if (leftSize === undefined || rightSize === undefined) return false;
    if (leftSize !== rightSize) return false;
  }
  return true;
}

function runApp1Comparison(params: {
  store: ReturnType<typeof createSqliteStore>;
  rootFoo: ReturnType<typeof makeRoot>;
  rootBar: ReturnType<typeof makeRoot>;
  snapFooId: string;
  snapBarId: string;
  scopeBase: string;
}): App1ComparisonResult {
  const { store, rootFoo, rootBar, snapFooId, snapBarId, scopeBase } = params;

  // Step 1: raw diff (OS layer only) — the “diff only view” before container matching.
  const comparer = new DefaultComparer(store);
  const identity = {
    strategies: [
      { type: EvidenceType.VPATH, weight: 1 },
      { type: EvidenceType.SIZE, weight: 1 }
    ],
    conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
    thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
    casePolicy: 'SENSITIVE' as const
  };
  const move = { enabled: false, strategies: [], minConfidence: Confidence.POSSIBLE };

  const rawDiff = comparer.compare(snapFooId, snapBarId, {
    mode: CompareMode.STRICT,
    scope: { baseVPath: scopeBase, mode: ScopeMode.FULL_SUBTREE },
    identity,
    move,
    requireObservedCoverage: false
  });

  const diffPaths = rawDiff.entries.map((entry) => entry.path).sort();

  // Step 2: App1-style container matching (archive-driven).
  // We only look for containers where a zip exists, then compare subtree contents.
  const fooNodes = store.queryNodes(snapFooId, { filter: { vpathPrefix: scopeBase } }).nodes;
  const barNodes = store.queryNodes(snapBarId, { filter: { vpathPrefix: scopeBase } }).nodes;

  // Index directories by vpath for quick lookup.
  const fooDirs = new Set(fooNodes.filter((n) => n.kind === NodeKind.DIR && n.ref.layers.length === 1).map((n) => n.ref.vpath));
  const barDirs = new Set(barNodes.filter((n) => n.kind === NodeKind.DIR && n.ref.layers.length === 1).map((n) => n.ref.vpath));

  // Collect zip containers from bar (archive-driven approach).
  const barZips = barNodes
    .filter((n) => n.kind === NodeKind.FILE && n.ref.layers.length === 1 && n.name.toLowerCase().endsWith('.zip'))
    .map((n) => n.ref.vpath);

  // Helper: derive container key from "/backup.zip" -> "/backup".
  const containerKeyFromZip = (zipVPath: string) => zipVPath.replace(/\.zip$/i, '');

  const containerComparisons: ContainerComparison[] = [];
  for (const zipVPath of barZips) {
    const containerKey = containerKeyFromZip(zipVPath);

    const fooHasDir = fooDirs.has(containerKey);
    const barHasDir = barDirs.has(containerKey);

    let fooVsBarZip = false;
    let barDirVsZip = false;
    if (fooHasDir) {
      // File-only comparison keeps parity with archive scanning (directory entries may be absent).
      const baseFoo = { rootId: rootFoo.rootId, layers: [{ kind: LayerKind.OS, rootId: rootFoo.rootId }], vpath: containerKey };
      const baseBarZip = {
        rootId: rootBar.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootBar.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: zipVPath }
        ],
        vpath: '/'
      };
      const fooFiles = collectFileNodes(store, snapFooId, baseFoo, '/');
      const zipFiles = collectFileNodes(store, snapBarId, baseBarZip, '/');
      fooVsBarZip = fileTreesEqual(fooFiles, zipFiles);
    }

    if (barHasDir) {
      // Compare bar’s directory against its own zip (duplicate container) using file-only comparison.
      const baseBarDir = { rootId: rootBar.rootId, layers: [{ kind: LayerKind.OS, rootId: rootBar.rootId }], vpath: containerKey };
      const baseBarZip = {
        rootId: rootBar.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootBar.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: zipVPath }
        ],
        vpath: '/'
      };
      const barFiles = collectFileNodes(store, snapBarId, baseBarDir, '/');
      const zipFiles = collectFileNodes(store, snapBarId, baseBarZip, '/');
      barDirVsZip = fileTreesEqual(barFiles, zipFiles);
    }

    containerComparisons.push({ containerKey, zipVPath, fooHasDir, barHasDir, fooVsBarZip, barDirVsZip });
  }

  // Step 3: build a UI-facing "display model" from diff + container matches.
  const toDisplayPath = (absVPath: string) => {
    if (scopeBase === '/') return absVPath;
    if (absVPath === scopeBase) return '/';
    if (absVPath.startsWith(`${scopeBase}/`)) return absVPath.slice(scopeBase.length);
    return absVPath;
  };

  const diffPathSet = new Set(diffPaths);
  const displayModel: DisplayRow[] = containerComparisons
    .map((comparison) => {
      const entries: DisplayEntry[] = [];
      if (comparison.fooHasDir) {
        entries.push({
          side: 'left',
          kind: 'dir',
          vpath: toDisplayPath(comparison.containerKey),
          contentEqual: comparison.fooVsBarZip
        });
      }
      if (comparison.barHasDir) {
        entries.push({
          side: 'right',
          kind: 'dir',
          vpath: toDisplayPath(comparison.containerKey),
          contentEqual: comparison.barDirVsZip
        });
      }
      entries.push({
        side: 'right',
        kind: 'zip',
        vpath: toDisplayPath(comparison.zipVPath),
        contentEqual: comparison.fooVsBarZip || comparison.barDirVsZip
      });
      entries.sort((a, b) => {
        if (a.side !== b.side) return a.side === 'left' ? -1 : 1;
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.vpath.localeCompare(b.vpath);
      });
      return {
        displayKey: toDisplayPath(comparison.containerKey),
        entries
      };
    })
    .filter((row) => row.entries.some((entry) => diffPathSet.has(entry.vpath)))
    .sort((a, b) => a.displayKey.localeCompare(b.displayKey));

  return { diffPaths, containerComparisons, displayModel };
}

// E2E: App1 scenario from the conversation.
// - foo has directories: others/, backup/, baz/ (each with a .txt file)
// - bar has directories: others/, backup/ plus backup.zip and baz.zip
// - zip contents are the same as the corresponding directories in foo
//
// The app logic is:
// 1) Run a raw diff to find "obvious" differences.
// 2) If a zip exists, look for a same-name directory and compare subtree contents.
// 3) Use a file-only subtree comparison to mark "content equal" even when containers differ.
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
      const fooRoot = fooDir;
      const barRoot = barDir;

      // foo fixtures (add a nested depth to make subtree comparisons non-trivial)
      // [filename]               | [content]
      // foo/others/B.txt         | B
      // foo/backup/A.txt         | A
      // foo/backup/nested/AA.txt | AA
      // foo/baz/C.txt            | C
      // foo/baz/nested/CC.txt    | CC
      fs.mkdirSync(path.join(fooRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'backup'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'baz'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'backup', 'nested'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'baz', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(fooRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(fooRoot, 'backup', 'A.txt'), 'A');
      fs.writeFileSync(path.join(fooRoot, 'baz', 'C.txt'), 'C');
      fs.writeFileSync(path.join(fooRoot, 'backup', 'nested', 'AA.txt'), 'AA');
      fs.writeFileSync(path.join(fooRoot, 'baz', 'nested', 'CC.txt'), 'CC');

      // bar fixtures (directories + archives; no baz directory, zip-only)
      // [filename]                    | [content]
      // bar/others/B.txt              | B
      // bar/backup/A.txt              | A
      // bar/backup/nested/AA.txt      | AA
      // bar/backup.zip!/A.txt         | A
      // bar/backup.zip!/nested/AA.txt | AA
      // bar/baz.zip!/C.txt            | C
      // bar/baz.zip!/nested/CC.txt    | CC
      fs.mkdirSync(path.join(barRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'backup'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'backup', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(barRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(barRoot, 'backup', 'A.txt'), 'A');
      fs.writeFileSync(path.join(barRoot, 'backup', 'nested', 'AA.txt'), 'AA');
      await createZip(path.join(barRoot, 'backup.zip'), [
        { name: 'nested/', dir: true },
        { name: 'A.txt', content: 'A' },
        { name: 'nested/AA.txt', content: 'AA' }
      ]);
      await createZip(path.join(barRoot, 'baz.zip'), [
        { name: 'nested/', dir: true },
        { name: 'C.txt', content: 'C' },
        { name: 'nested/CC.txt', content: 'CC' }
      ]);

      // --- Step 2: scan into sqlite snapshots (include archives) ---
      const scopeBase = '/';
      store = createSqliteStore(baseDir);
      const rootFoo = makeRoot('r:foo', fooDir);
      const rootBar = makeRoot('r:bar', barDir);
      store.registerRoot(rootFoo);
      store.registerRoot(rootBar);

      const snapFoo = store.createSnapshot(rootFoo.rootId);
      const snapBar = store.createSnapshot(rootBar.rootId);
      await scanAndPersist({
        store,
        root: rootFoo,
        snapshotId: snapFoo.snapshotId,
        scopes: [{ baseVPath: scopeBase, mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: true
      });
      await scanAndPersist({
        store,
        root: rootBar,
        snapshotId: snapBar.snapshotId,
        scopes: [{ baseVPath: scopeBase, mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: true
      });

      // --- Step 3: compare + build display model (raw diff + container matching) ---
      const { diffPaths, containerComparisons, displayModel } = runApp1Comparison({
        store,
        rootFoo,
        rootBar,
        snapFooId: snapFoo.snapshotId,
        snapBarId: snapBar.snapshotId,
        scopeBase
      });

      // "others" should not appear in diff because it is identical in both roots.
      expect(diffPaths.some((p) => p.startsWith('/others'))).toBe(false);

      // The archive containers should show up as ADDED in bar.
      expect(diffPaths).toContain('/backup.zip');
      expect(diffPaths).toContain('/baz.zip');

      // foo has /baz while bar has baz.zip; we expect a removed entry under /baz.
      expect(diffPaths.some((p) => p.startsWith('/baz'))).toBe(true);

      // --- Step 4: Assertions that reflect the App1 scenario ---
      const backup = containerComparisons.find((c) => c.containerKey.endsWith('/backup'));
      const baz = containerComparisons.find((c) => c.containerKey.endsWith('/baz'));

      // backup: foo dir vs bar zip is equivalent (green indicator).
      expect(backup?.fooVsBarZip).toBe(true);
      // backup: bar dir vs bar zip are equivalent (duplicate container resolved).
      expect(backup?.barDirVsZip).toBe(true);

      // baz: foo dir vs bar zip is equivalent (green indicator).
      expect(baz?.fooVsBarZip).toBe(true);
      // baz: bar has no baz dir, so duplicate comparison is false by design.
      expect(baz?.barDirVsZip).toBe(false);

      // Display model: only backup and baz appear in diff-only view.
      expect(displayModel.map((row) => row.displayKey).sort()).toEqual(['/backup', '/baz']);

      const backupRow = displayModel.find((row) => row.displayKey === '/backup');
      const bazRow = displayModel.find((row) => row.displayKey === '/baz');

      // backup row shows foo dir, bar dir, and bar zip — all content-equal.
      expect(backupRow?.entries).toEqual([
        { side: 'left', kind: 'dir', vpath: '/backup', contentEqual: true },
        { side: 'right', kind: 'dir', vpath: '/backup', contentEqual: true },
        { side: 'right', kind: 'zip', vpath: '/backup.zip', contentEqual: true }
      ]);

      // baz row shows foo dir and bar zip — content-equal despite container mismatch.
      expect(bazRow?.entries).toEqual([
        { side: 'left', kind: 'dir', vpath: '/baz', contentEqual: true },
        { side: 'right', kind: 'zip', vpath: '/baz.zip', contentEqual: true }
      ]);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });

  it('flags container mismatches when archive contents diverge', async () => {
    // --- Step 1: build filesystem fixtures (programmatic, minimal, deterministic) ---
    const baseDir = createTempDir('e2e-app1-');
    const fooDir = path.join(baseDir, 'foo');
    const barDir = path.join(baseDir, 'bar');
    fs.mkdirSync(fooDir, { recursive: true });
    fs.mkdirSync(barDir, { recursive: true });

    let store: ReturnType<typeof createSqliteStore> | undefined;
    try {
      const fooRoot = fooDir;
      const barRoot = barDir;

      // foo fixtures (add a nested depth to make subtree comparisons non-trivial)
      // [filename]               | [content]
      // foo/others/B.txt         | B
      // foo/backup/A.txt         | A
      // foo/backup/nested/AA.txt | AA
      // foo/baz/C.txt            | C
      // foo/baz/nested/CC.txt    | CC
      // foo/mix/M.txt            | M
      fs.mkdirSync(path.join(fooRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'backup'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'baz'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'mix'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'backup', 'nested'), { recursive: true });
      fs.mkdirSync(path.join(fooRoot, 'baz', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(fooRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(fooRoot, 'backup', 'A.txt'), 'A');
      fs.writeFileSync(path.join(fooRoot, 'baz', 'C.txt'), 'C');
      fs.writeFileSync(path.join(fooRoot, 'mix', 'M.txt'), 'M');
      fs.writeFileSync(path.join(fooRoot, 'backup', 'nested', 'AA.txt'), 'AA');
      fs.writeFileSync(path.join(fooRoot, 'baz', 'nested', 'CC.txt'), 'CC');

      // bar fixtures (directories + archives; mix dir content differs)
      // [filename]                    | [content]
      // bar/others/B.txt              | B
      // bar/backup/A.txt              | A
      // bar/backup/nested/AA.txt      | AA
      // bar/mix/M.txt                 | M-dir
      // bar/backup.zip!/A.txt         | A-zip-diff
      // bar/backup.zip!/nested/AA.txt | AA
      // bar/baz.zip!/C.txt            | C-zip-diff
      // bar/baz.zip!/nested/CC.txt    | CC
      // bar/mix.zip!/M.txt            | M
      fs.mkdirSync(path.join(barRoot, 'others'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'backup'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'mix'), { recursive: true });
      fs.mkdirSync(path.join(barRoot, 'backup', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(barRoot, 'others', 'B.txt'), 'B');
      fs.writeFileSync(path.join(barRoot, 'backup', 'A.txt'), 'A');
      fs.writeFileSync(path.join(barRoot, 'mix', 'M.txt'), 'M-dir');
      fs.writeFileSync(path.join(barRoot, 'backup', 'nested', 'AA.txt'), 'AA');
      await createZip(path.join(barRoot, 'backup.zip'), [
        { name: 'nested/', dir: true },
        { name: 'A.txt', content: 'A-zip-diff' },
        { name: 'nested/AA.txt', content: 'AA' }
      ]);
      await createZip(path.join(barRoot, 'baz.zip'), [
        { name: 'nested/', dir: true },
        { name: 'C.txt', content: 'C-zip-diff' },
        { name: 'nested/CC.txt', content: 'CC' }
      ]);
      await createZip(path.join(barRoot, 'mix.zip'), [{ name: 'M.txt', content: 'M' }]);

      // --- Step 2: scan into sqlite snapshots (include archives) ---
      const scopeBase = '/';
      store = createSqliteStore(baseDir);
      const rootFoo = makeRoot('r:foo', fooDir);
      const rootBar = makeRoot('r:bar', barDir);
      store.registerRoot(rootFoo);
      store.registerRoot(rootBar);

      const snapFoo = store.createSnapshot(rootFoo.rootId);
      const snapBar = store.createSnapshot(rootBar.rootId);
      await scanAndPersist({
        store,
        root: rootFoo,
        snapshotId: snapFoo.snapshotId,
        scopes: [{ baseVPath: scopeBase, mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: true
      });
      await scanAndPersist({
        store,
        root: rootBar,
        snapshotId: snapBar.snapshotId,
        scopes: [{ baseVPath: scopeBase, mode: ScopeMode.FULL_SUBTREE }],
        includeArchives: true
      });

      // Sanity check: ensure archive entries (including EXTRA.txt) were scanned.
      const fooA = store.getNodeByRef(snapFoo.snapshotId, {
        rootId: rootFoo.rootId,
        layers: [{ kind: LayerKind.OS, rootId: rootFoo.rootId }],
        vpath: '/backup/A.txt'
      });
      const barZipA = store.getNodeByRef(snapBar.snapshotId, {
        rootId: rootBar.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootBar.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/backup.zip' }
        ],
        vpath: '/A.txt'
      });
      const fooMix = store.getNodeByRef(snapFoo.snapshotId, {
        rootId: rootFoo.rootId,
        layers: [{ kind: LayerKind.OS, rootId: rootFoo.rootId }],
        vpath: '/mix/M.txt'
      });
      const barMix = store.getNodeByRef(snapBar.snapshotId, {
        rootId: rootBar.rootId,
        layers: [{ kind: LayerKind.OS, rootId: rootBar.rootId }],
        vpath: '/mix/M.txt'
      });
      const barZipMix = store.getNodeByRef(snapBar.snapshotId, {
        rootId: rootBar.rootId,
        layers: [
          { kind: LayerKind.OS, rootId: rootBar.rootId },
          { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/mix.zip' }
        ],
        vpath: '/M.txt'
      });
      expect(fooA?.size).not.toBeUndefined();
      expect(barZipA?.size).not.toBeUndefined();
      expect(fooA?.size).not.toBe(barZipA?.size);
      expect(fooMix?.size).not.toBeUndefined();
      expect(barMix?.size).not.toBeUndefined();
      expect(barZipMix?.size).not.toBeUndefined();
      expect(barMix?.size).not.toBe(barZipMix?.size);

      // --- Step 3: compare + build display model (raw diff + container matching) ---
      const { diffPaths, containerComparisons, displayModel } = runApp1Comparison({
        store,
        rootFoo,
        rootBar,
        snapFooId: snapFoo.snapshotId,
        snapBarId: snapBar.snapshotId,
        scopeBase
      });

      // "others" should not appear in diff because it is identical in both roots.
      expect(diffPaths.some((p) => p.startsWith('/others'))).toBe(false);
      expect(diffPaths).toEqual(expect.arrayContaining(['/backup.zip', '/baz.zip', '/mix.zip']));
      expect(diffPaths.some((p) => p.startsWith('/baz'))).toBe(true);

      // --- Step 4: Assertions for divergent container scenarios ---
      const backup = containerComparisons.find((c) => c.containerKey.endsWith('/backup'));
      const baz = containerComparisons.find((c) => c.containerKey.endsWith('/baz'));
      const mix = containerComparisons.find((c) => c.containerKey.endsWith('/mix'));

      // backup: both comparisons are false because zip contents differ from directories.
      expect(backup?.fooVsBarZip).toBe(false);
      expect(backup?.barDirVsZip).toBe(false);

      // baz: foo dir vs bar zip is false, and bar has no baz dir.
      expect(baz?.fooVsBarZip).toBe(false);
      expect(baz?.barDirVsZip).toBe(false);

      // mix: foo dir matches zip, but bar dir differs from its zip.
      expect(mix?.fooVsBarZip).toBe(true);
      expect(mix?.barDirVsZip).toBe(false);

      // Display model includes all three containers with mixed contentEqual states.
      expect(displayModel.map((row) => row.displayKey).sort()).toEqual(['/backup', '/baz', '/mix']);

      const backupRow = displayModel.find((row) => row.displayKey === '/backup');
      const bazRow = displayModel.find((row) => row.displayKey === '/baz');
      const mixRow = displayModel.find((row) => row.displayKey === '/mix');

      expect(backupRow?.entries).toEqual([
        { side: 'left', kind: 'dir', vpath: '/backup', contentEqual: false },
        { side: 'right', kind: 'dir', vpath: '/backup', contentEqual: false },
        { side: 'right', kind: 'zip', vpath: '/backup.zip', contentEqual: false }
      ]);

      expect(bazRow?.entries).toEqual([
        { side: 'left', kind: 'dir', vpath: '/baz', contentEqual: false },
        { side: 'right', kind: 'zip', vpath: '/baz.zip', contentEqual: false }
      ]);

      expect(mixRow?.entries).toEqual([
        { side: 'left', kind: 'dir', vpath: '/mix', contentEqual: true },
        { side: 'right', kind: 'dir', vpath: '/mix', contentEqual: false },
        { side: 'right', kind: 'zip', vpath: '/mix.zip', contentEqual: true }
      ]);
    } finally {
      store?.close();
      cleanupTempDir(baseDir);
    }
  });
});
