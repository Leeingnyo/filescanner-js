import { SqliteSnapshotStore } from '../../dist/index.js';
import { ScopeMode } from '../../dist/types/scan.js';
import { NodeKind } from '../../dist/types/enums.js';
import { LayerKind } from '../../dist/types/layers.js';
import { NodeSortKey, SortOrder } from '../../dist/types/store/query.js';
import { parseArgs } from './args.js';
import { createTempDir, cleanupTempDir, createFileTree } from './fixtures.js';
import { makeRoot } from './root.js';
import { scanCollect } from './scan-utils.js';
import { measureAsync, formatMs } from './timer.js';

const args = parseArgs(process.argv, {
  files: 20000,
  depth: 3,
  branch: 8,
  repeat: 5,
  keep: false
});

const baseDir = createTempDir('bench-store-');
const rootDir = `${baseDir}/root`;

try {
  const files = createFileTree({
    rootDir,
    files: args.files,
    depth: args.depth,
    branch: args.branch
  });

  const store = new SqliteSnapshotStore({ path: `${baseDir}/store.db` });
  const root = makeRoot('r:store', rootDir);
  store.registerRoot(root);
  const snapshot = store.createSnapshot(root.rootId);

  const { run, coverage, nodes } = await scanCollect({
    root,
    includeArchives: false,
    scopes: [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }]
  });

  const upsertResult = await measureAsync('upsert', () => {
    const patch = store.beginPatch(snapshot.snapshotId, run);
    patch.upsertNodes(nodes);
    patch.recordCoverage(coverage);
    patch.commit();
  });

  const queryResult = await measureAsync('query', () => {
    for (let i = 0; i < args.repeat; i += 1) {
      store.queryNodes(snapshot.snapshotId, {
        filter: { vpathPrefix: '/', kinds: [NodeKind.FILE] },
        sort: { key: NodeSortKey.VPATH, order: SortOrder.ASC },
        page: { limit: 100 }
      });
    }
  });

  const sampleFile = files[0];
  const firstSegment = sampleFile.split('/')[0];
  const sampleDir = sampleFile.includes('/') ? `/${firstSegment}` : '/';
  const listResult = await measureAsync('listChildren', () => {
    const ref = { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath: sampleDir };
    for (let i = 0; i < args.repeat; i += 1) {
      store.listChildren(snapshot.snapshotId, ref, undefined, { limit: 100 });
    }
  });

  console.log(`store bench`);
  console.log(`- files: ${args.files}`);
  console.log(`- upsert: ${formatMs(upsertResult.ms)}`);
  console.log(`- queryNodes x${args.repeat}: ${formatMs(queryResult.ms)}`);
  console.log(`- listChildren x${args.repeat}: ${formatMs(listResult.ms)}`);
} finally {
  if (!args.keep) cleanupTempDir(baseDir);
}
