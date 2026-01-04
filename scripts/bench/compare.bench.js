import { DefaultComparer, SqliteSnapshotStore } from '../../dist/index.js';
import { CompareMode, Confidence, ConflictHandling, EvidenceType } from '../../dist/types/compare.js';
import { ScopeMode } from '../../dist/types/scan.js';
import { parseArgs } from './args.js';
import { createTempDir, cleanupTempDir, createFileTree, mutateContent, moveFiles } from './fixtures.js';
import { makeRoot } from './root.js';
import { scanToSnapshot } from './scan-utils.js';
import { measureAsync, formatMs } from './timer.js';

const args = parseArgs(process.argv, {
  files: 20000,
  depth: 3,
  branch: 8,
  changes: 200,
  moves: 200,
  keep: false
});

const baseDir = createTempDir('bench-compare-');
const leftDir = `${baseDir}/left`;
const rightDir = `${baseDir}/right`;

try {
  const leftFiles = createFileTree({
    rootDir: leftDir,
    files: args.files,
    depth: args.depth,
    branch: args.branch
  });
  createFileTree({
    rootDir: rightDir,
    files: args.files,
    depth: args.depth,
    branch: args.branch
  });

  mutateContent({ rootDir: rightDir, files: leftFiles, count: args.changes, suffix: 'changed' });
  moveFiles({ rootDir: rightDir, files: leftFiles, count: args.moves, targetDir: 'moved' });

  const store = new SqliteSnapshotStore({ path: `${baseDir}/compare.db` });
  const rootLeft = makeRoot('r:left', leftDir);
  const rootRight = makeRoot('r:right', rightDir);
  store.registerRoot(rootLeft);
  store.registerRoot(rootRight);

  const snapLeft = store.createSnapshot(rootLeft.rootId);
  const snapRight = store.createSnapshot(rootRight.rootId);

  await scanToSnapshot({
    store,
    root: rootLeft,
    snapshotId: snapLeft.snapshotId,
    includeArchives: false,
    scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }]
  });
  await scanToSnapshot({
    store,
    root: rootRight,
    snapshotId: snapRight.snapshotId,
    includeArchives: false,
    scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }]
  });

  const comparer = new DefaultComparer(store);
  const result = await measureAsync('compare', () =>
    comparer.compare(snapLeft.snapshotId, snapRight.snapshotId, {
      mode: CompareMode.STRICT,
      scope: { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      identity: {
        strategies: [
          { type: EvidenceType.VPATH, weight: 1 },
          { type: EvidenceType.SIZE, weight: 1 }
        ],
        conflictHandling: ConflictHandling.PREFER_STRONGER_EVIDENCE,
        thresholds: { sameCertain: 1, sameLikely: 0.5, differentCertain: 1 },
        casePolicy: 'SENSITIVE'
      },
      move: {
        enabled: true,
        strategies: [EvidenceType.VPATH, EvidenceType.SIZE],
        minConfidence: Confidence.POSSIBLE
      },
      requireObservedCoverage: true
    })
  );

  const diff = result.result;
  console.log(`compare bench`);
  console.log(`- files: ${args.files}`);
  console.log(`- changes: ${args.changes}`);
  console.log(`- moves: ${args.moves}`);
  console.log(`- duration: ${formatMs(result.ms)}`);
  console.log(
    `- summary: added=${diff.summary.added} removed=${diff.summary.removed} modified=${diff.summary.modified} moved=${diff.summary.moved}`
  );
} finally {
  if (!args.keep) cleanupTempDir(baseDir);
}
