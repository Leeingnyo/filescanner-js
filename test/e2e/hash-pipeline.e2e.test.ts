import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileSystemScanner } from '../../src/scanner/FileSystemScanner.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { DefaultVfs } from '../../src/vfs/DefaultVfs.js';
import { DefaultComparer } from '../../src/compare/DefaultComparer.js';
import { CompareMode, Confidence, ConflictHandling, DiffEntryType, EvidenceType } from '../../src/types/compare.js';
import { ScopeMode } from '../../src/types/scan.js';
import { HashStatus, NodeKind } from '../../src/types/enums.js';
import { LayerKind } from '../../src/types/layers.js';
import type { ObservedNode } from '../../src/types/observedNode.js';
import { createTempDir, cleanupTempDir, createSqliteStore, makeRoot, makePolicy, defaultIgnore, defaultConcurrency } from './helpers.js';

async function hashStream(stream: NodeJS.ReadableStream, algo: 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algo);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function scanWithHashing(params: {
  store: ReturnType<typeof createSqliteStore>;
  root: ReturnType<typeof makeRoot>;
  snapshotId: string;
}): Promise<void> {
  const { store, root, snapshotId } = params;
  const registry = new ArchiveRegistry([new ZipArchiveReader()]);
  const scanner = new FileSystemScanner({ getRoot: () => root }, registry);
  const vfs = new DefaultVfs({ getRoot: () => root }, registry);

  const fileNodes: ObservedNode[] = [];
  let patch: ReturnType<typeof store.beginPatch> | undefined;
  let coverage: any;
  let run: any;

  await new Promise<void>((resolve) => {
    scanner.startScan(
      {
        snapshotId,
        rootId: root.rootId,
        scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
        policy: makePolicy(false),
        ignore: defaultIgnore,
        concurrency: defaultConcurrency
      },
      {
        onRunStarted: (started) => {
          run = started;
          patch = store.beginPatch(snapshotId, run);
        },
        onNodes: (batch) => {
          patch?.upsertNodes(batch);
          fileNodes.push(...batch.filter((node) => node.kind === NodeKind.FILE));
        },
        onError: () => {
          // Run-level errors are not used in this test.
        },
        onRunFinished: (finished, cov) => {
          run = finished;
          coverage = cov;
          resolve();
        }
      }
    );
  });

  // Post-process: hash FILE nodes using Vfs.openRead and re-upsert with the same runId.
  const hashedNodes: ObservedNode[] = [];
  for (const node of fileNodes) {
    const stream = await vfs.openRead(node.ref);
    const digest = await hashStream(stream, 'sha256');
    hashedNodes.push({
      ...node,
      hashes: {
        ...node.hashes,
        sha256: { algo: 'sha256', status: HashStatus.PRESENT, value: digest }
      }
    });
  }
  if (hashedNodes.length > 0) {
    patch?.upsertNodes(hashedNodes);
  }
  patch?.recordCoverage(coverage);
  patch?.commit();
}

describe('E2E hash pipeline', () => {
  it('hashes content via onNodes and detects moves by content hash', async () => {
    const baseDir = createTempDir('e2e-hash-');
    const leftDir = path.join(baseDir, 'left');
    const rightDir = path.join(baseDir, 'right');
    fs.mkdirSync(leftDir, { recursive: true });
    fs.mkdirSync(rightDir, { recursive: true });

    // Fixtures:
    // left/alpha.txt  -> "same-content"
    // right/beta.txt  -> "same-content" (renamed but identical content)
    fs.writeFileSync(path.join(leftDir, 'alpha.txt'), 'same-content');
    fs.writeFileSync(path.join(rightDir, 'beta.txt'), 'same-content');

    const store = createSqliteStore(baseDir);
    try {
      const leftRoot = makeRoot('r:left', leftDir);
      const rightRoot = makeRoot('r:right', rightDir);
      store.registerRoot(leftRoot);
      store.registerRoot(rightRoot);

      const leftSnap = store.createSnapshot(leftRoot.rootId);
      const rightSnap = store.createSnapshot(rightRoot.rootId);

      await scanWithHashing({ store, root: leftRoot, snapshotId: leftSnap.snapshotId });
      await scanWithHashing({ store, root: rightRoot, snapshotId: rightSnap.snapshotId });

      // Sanity check: hashes were persisted into the store.
      const leftNode = store.getNodeByRef(leftSnap.snapshotId, {
        rootId: leftRoot.rootId,
        layers: [{ kind: LayerKind.OS, rootId: leftRoot.rootId }],
        vpath: '/alpha.txt'
      });
      const rightNode = store.getNodeByRef(rightSnap.snapshotId, {
        rootId: rightRoot.rootId,
        layers: [{ kind: LayerKind.OS, rootId: rightRoot.rootId }],
        vpath: '/beta.txt'
      });
      expect(leftNode?.hashes.sha256?.status).toBe(HashStatus.PRESENT);
      expect(rightNode?.hashes.sha256?.status).toBe(HashStatus.PRESENT);
      expect(leftNode?.hashes.sha256?.value).toBe(rightNode?.hashes.sha256?.value);

      // Compare by content hash only: different names, same content -> MOVED.
      const comparer = new DefaultComparer(store);
      const diff = comparer.compare(leftSnap.snapshotId, rightSnap.snapshotId, {
        mode: CompareMode.STRICT,
        scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
        identity: {
          strategies: [
            { type: EvidenceType.VPATH, weight: 1 },
            { type: EvidenceType.CONTENT_HASH, weight: 1 }
          ],
          conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
          thresholds: { sameCertain: 1, sameLikely: 1, differentCertain: 1 },
          casePolicy: 'SENSITIVE'
        },
        move: {
          enabled: true,
          strategies: [EvidenceType.CONTENT_HASH],
          minConfidence: Confidence.CERTAIN
        },
        requireObservedCoverage: true
      });

      expect(diff.summary.moved).toBe(1);
      expect(diff.summary.added).toBe(0);
      expect(diff.summary.removed).toBe(0);
      expect(diff.entries.some((entry) => entry.type === DiffEntryType.MOVED && entry.path === '/beta.txt')).toBe(true);
    } finally {
      store.close();
      cleanupTempDir(baseDir);
    }
  });
});
