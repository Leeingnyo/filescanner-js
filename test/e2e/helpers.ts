import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import { FileSystemScanner } from '../../src/scanner/FileSystemScanner.js';
import { ArchiveRegistry } from '../../src/archive/ArchiveRegistry.js';
import { ZipArchiveReader } from '../../src/archive/zip/ZipArchiveReader.js';
import { SqliteSnapshotStore } from '../../src/store/sqlite/SqliteSnapshotStore.js';
import { normalizeRootKey } from '../../src/root/normalizeRootKey.js';
import { CasePolicy, OsKind } from '../../src/types/enums.js';
import { ErrorPolicy, SymlinkPolicy, type ScanPolicy, type IgnoreRules, type Concurrency } from '../../src/types/scanPolicy.js';
import type { ScanScope, ScanRun, Coverage } from '../../src/types/scan.js';
import type { RootDescriptor } from '../../src/types/root.js';
import type { ObservedNode } from '../../src/types/observedNode.js';
import type { SnapshotId } from '../../src/types/ids.js';
import type { ScanRequest } from '../../src/types/scanRequest.js';

// --- Filesystem helpers ----------------------------------------------------

// Create a unique temp directory for a single test file.
// Each E2E test uses its own temp root so tests can run in parallel safely.
export function createTempDir(prefix = 'filescanner-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Cleanup helper that always removes the temp tree for a test.
// We keep cleanup explicit inside each test to avoid shared global state.
export function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Create a small zip archive at zipPath with a list of entries.
// This is used by archive-aware E2E tests and keeps fixtures in-code only.
export function createZip(zipPath: string, entries: { name: string; content: string }[]): Promise<void> {
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

// --- Store + scan helpers --------------------------------------------------

// Create a SqliteSnapshotStore using a sqlite file inside the test temp dir.
// The sqlite file is deleted when the temp dir is removed.
export function createSqliteStore(baseDir: string, filename = 'store.db'): SqliteSnapshotStore {
  const dbPath = path.join(baseDir, filename);
  return new SqliteSnapshotStore({ path: dbPath });
}

// Build a RootDescriptor for a given OS path.
// We keep case policy AUTO and provide capabilities explicitly for test control.
export function makeRoot(rootId: string, osPath: string, supportsFileId = false): RootDescriptor {
  const osKind = process.platform === 'win32' ? OsKind.WINDOWS : OsKind.POSIX;
  return {
    rootId,
    rootKey: normalizeRootKey(osPath, osKind),
    os: osKind,
    osPath,
    createdAt: new Date().toISOString(),
    casePolicy: CasePolicy.AUTO,
    capabilities: { caseSensitive: process.platform !== 'win32', supportsFileId }
  };
}

// Standard policy used by E2E tests, with archive behavior toggled per test.
export function makePolicy(includeArchives: boolean): ScanPolicy {
  return {
    errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
    symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
    archivePolicy: {
      includeArchives,
      formats: ['zip'],
      maxNesting: 2,
      onEncrypted: ErrorPolicy.SKIP_SUBTREE
    }
  };
}

// Default ignore rules keep tests explicit and deterministic.
export const defaultIgnore: IgnoreRules = { glob: [], regex: [] };
// Force single-thread scanning to avoid timing variance in E2E tests.
export const defaultConcurrency: Concurrency = { io: 1, cpu: 1 };

// Scan a root and persist the results into an existing snapshot.
// This encapsulates the end-to-end flow: scan → capture nodes/coverage → patch commit.
export async function scanAndPersist(params: {
  store: SqliteSnapshotStore;
  root: RootDescriptor;
  snapshotId: SnapshotId;
  scopes: ScanScope[];
  includeArchives: boolean;
  policy?: ScanPolicy;
  cancel?: boolean;
}): Promise<{ run: ScanRun; coverage: Coverage; nodes: ObservedNode[] }> {
  const { store, root, snapshotId, scopes, includeArchives, policy, cancel } = params;
  const scanner = new FileSystemScanner({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
  const request: ScanRequest = {
    snapshotId,
    rootId: root.rootId,
    scopes,
    policy: policy ?? makePolicy(includeArchives),
    ignore: defaultIgnore,
    concurrency: defaultConcurrency
  };

  // Collect nodes in memory to simulate a full scan ingest into the store.
  // This is close to how a real consumer would wire ScanSink to persistence.
  const nodes: ObservedNode[] = [];
  let run: ScanRun | undefined;
  let coverage: Coverage | undefined;

  await new Promise<void>((resolve) => {
    const { control } = scanner.startScan(request, {
      onRunStarted: (started) => {
        run = started;
      },
      onNodes: (batch) => {
        nodes.push(...batch);
      },
      onError: () => {
        // Errors are still recorded in coverage via FileSystemScanner.
      },
      onRunFinished: (finished, cov) => {
        run = finished;
        coverage = cov;
        resolve();
      }
    });
    if (cancel) {
      // Immediate cancel forces PARTIAL coverage for requested scopes.
      control.cancel();
    }
  });

  const session = store.beginPatch(snapshotId, run as ScanRun);
  session.upsertNodes(nodes);
  session.recordCoverage(coverage as Coverage);
  session.commit();

  return { run: run as ScanRun, coverage: coverage as Coverage, nodes };
}
