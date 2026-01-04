import { FileSystemScanner, ArchiveRegistry, ZipArchiveReader } from '../../dist/index.js';
import { makePolicy, defaultIgnore, defaultConcurrency } from './policy.js';

export async function scanCollect(params) {
  const { root, includeArchives, scopes } = params;
  const registry = new ArchiveRegistry([new ZipArchiveReader()]);
  const scanner = new FileSystemScanner({ getRoot: () => root }, registry);
  const nodes = [];
  let run;
  let coverage;

  await new Promise((resolve) => {
    scanner.startScan(
      {
        snapshotId: '',
        rootId: root.rootId,
        scopes,
        policy: makePolicy(includeArchives),
        ignore: defaultIgnore,
        concurrency: defaultConcurrency
      },
      {
        onRunStarted: (started) => {
          run = started;
        },
        onNodes: (batch) => {
          nodes.push(...batch);
        },
        onError: () => {},
        onRunFinished: (finished, cov) => {
          run = finished;
          coverage = cov;
          resolve();
        }
      }
    );
  });

  return { run, coverage, nodes };
}

export async function scanToSnapshot(params) {
  const { store, root, snapshotId, includeArchives, scopes } = params;
  const { run, coverage, nodes } = await scanCollect({ root, includeArchives, scopes });
  const patch = store.beginPatch(snapshotId, run);
  patch.upsertNodes(nodes);
  patch.recordCoverage(coverage);
  patch.commit();
  return { run, coverage, nodes };
}
