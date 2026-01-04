import { FileSystemScanner, ArchiveRegistry, ZipArchiveReader } from '../../dist/index.js';
import { ScopeMode } from '../../dist/types/scan.js';
import { parseArgs } from './args.js';
import { createTempDir, cleanupTempDir, createFileTree, createZips } from './fixtures.js';
import { makeRoot } from './root.js';
import { makePolicy, defaultIgnore, defaultConcurrency } from './policy.js';
import { measureAsync, formatMs } from './timer.js';

const args = parseArgs(process.argv, {
  files: 10000,
  depth: 3,
  branch: 8,
  archives: 0,
  keep: false
});

const baseDir = createTempDir('bench-scan-');
const rootDir = `${baseDir}/root`;

try {
  createFileTree({
    rootDir,
    files: args.files,
    depth: args.depth,
    branch: args.branch
  });

  if (args.archives > 0) {
    await createZips({ rootDir, count: args.archives, entriesPerZip: 10 });
  }

  const root = makeRoot('r:bench-scan', rootDir);
  const scanner = new FileSystemScanner({ getRoot: () => root }, new ArchiveRegistry([new ZipArchiveReader()]));
  let nodeCount = 0;

  const result = await measureAsync('scan', async () => {
    await new Promise((resolve) => {
      scanner.startScan(
        {
          snapshotId: '',
          rootId: root.rootId,
          scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }],
          policy: makePolicy(args.archives > 0),
          ignore: defaultIgnore,
          concurrency: defaultConcurrency
        },
        {
          onRunStarted: () => {},
          onNodes: (batch) => {
            nodeCount += batch.length;
          },
          onError: () => {},
          onRunFinished: () => resolve()
        }
      );
    });
  });

  const seconds = result.ms / 1000;
  const rate = seconds > 0 ? (nodeCount / seconds).toFixed(1) : 'n/a';
  console.log(`scan bench`);
  console.log(`- files: ${args.files}`);
  console.log(`- depth: ${args.depth}`);
  console.log(`- branch: ${args.branch}`);
  console.log(`- archives: ${args.archives}`);
  console.log(`- nodes: ${nodeCount}`);
  console.log(`- duration: ${formatMs(result.ms)}`);
  console.log(`- nodes/sec: ${rate}`);
} finally {
  if (!args.keep) cleanupTempDir(baseDir);
}
