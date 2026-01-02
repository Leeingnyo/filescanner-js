import fs from 'node:fs';
import path from 'node:path';
import type { Scanner } from '../types/scanner.js';
import type { ScanRequest } from '../types/scanRequest.js';
import type { ScanSink } from '../types/scanner.js';
import type { ScanRun, Coverage } from '../types/scan.js';
import { RunStatus, ScopeMode } from '../types/scan.js';
import { ErrorStage, ErrorCode, NodeKind, IdentityPlatform } from '../types/enums.js';
import { ErrorPolicy, SymlinkPolicy } from '../types/scanPolicy.js';
import type { ObservedNode } from '../types/observedNode.js';
import type { NodeRef } from '../types/noderef.js';
import type { RootDescriptor } from '../types/root.js';
import type { VPath } from '../types/ids.js';
import type { ScanPolicy } from '../types/scanPolicy.js';
import { appendVPath } from '../vpath/build.js';
import { vpathToOsPath } from '../root/osPath.js';
import { IgnoreMatcher } from './ignore/IgnoreMatcher.js';
import { mapFsError } from './errorMapper.js';
import { nowInstant } from '../utils/time.js';
import { ArchiveRegistry } from '../archive/ArchiveRegistry.js';
import { guessArchiveFormat } from '../archive/format.js';
import { LayerKind, type VfsLayer } from '../types/layers.js';
import { resolveCasePolicy } from '../root/casePolicy.js';
import { readStreamToBuffer } from '../utils/streams.js';
import { CoverageTracker } from './coverageTracker.js';
import { identityFromStat } from './identity.js';

interface RootProvider {
  getRoot(rootId: string): RootDescriptor;
}

export class FileSystemScanner implements Scanner {
  private readonly batchSize = 100;

  constructor(private readonly roots: RootProvider, private readonly archives: ArchiveRegistry) {}

  startScan(req: ScanRequest, sink: ScanSink): { run: ScanRun; control: { cancel(): void } } {
    const runId = `run:${Date.now()}`;
    const run: ScanRun = {
      runId,
      rootId: req.rootId,
      startedAt: nowInstant(),
      requestedScopes: req.scopes,
      status: RunStatus.RUNNING
    };
    let canceled = false;
    let failed = false;
    const control = {
      cancel() {
        canceled = true;
      }
    };

    const root = this.roots.getRoot(req.rootId);
    const rootRealPath = fs.realpathSync(root.osPath);
    const visited = new Set<string>([rootRealPath]);
    const casePolicy = resolveCasePolicy(root.casePolicy, root.capabilities);
    const ignoreMatcher = new IgnoreMatcher(req.ignore, casePolicy);
    const coverageTracker = new CoverageTracker(runId, req.scopes);
    const batch: ObservedNode[] = [];

    const flush = () => {
      if (batch.length > 0) {
        sink.onNodes(batch.splice(0, batch.length));
      }
    };

    const emitNode = (node: ObservedNode) => {
      batch.push(node);
      if (batch.length >= this.batchSize) {
        flush();
      }
    };

    const recordError = (coverageIndex: number | null, error: any) => {
      coverageTracker.recordError(coverageIndex, error);
      if (req.policy.errorPolicy === ErrorPolicy.FAIL_FAST) {
        failed = true;
        canceled = true;
      }
    };

    const scanFileSystem = async (
      vpath: VPath,
      scopeMode: ScopeMode,
      allowDescend: boolean,
      nesting: number,
      coverageIndex: number | null
    ) => {
      if (canceled) {
        if (coverageIndex !== null) coverageTracker.markPartial(coverageIndex);
        return;
      }
      if (vpath !== '/' && ignoreMatcher.isIgnored(vpath)) {
        return;
      }
      const osPath = vpathToOsPath(root, vpath);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(osPath);
      } catch (err) {
        const error = mapFsError(err, ErrorStage.STAT);
        emitNode(this.errorNode(vpath, root, runId, error));
        sink.onError(error);
        recordError(coverageIndex, error);
        return;
      }

      const nodeErrors: any[] = [];
      let kind = stat.isDirectory()
        ? NodeKind.DIR
        : stat.isFile()
          ? NodeKind.FILE
          : stat.isSymbolicLink()
            ? NodeKind.SYMLINK
            : NodeKind.SPECIAL;

      let canDescend = allowDescend;
      if (stat.isSymbolicLink()) {
        if (req.policy.symlinkPolicy === SymlinkPolicy.DONT_FOLLOW) {
          canDescend = false;
        } else {
          try {
            const targetStat = fs.statSync(osPath);
            if (targetStat.isDirectory() && canDescend) {
              const targetReal = fs.realpathSync(osPath);
              if (req.policy.symlinkPolicy === SymlinkPolicy.FOLLOW_SAFE) {
                const rel = path.relative(rootRealPath, targetReal);
                if (rel.startsWith('..') || path.isAbsolute(rel)) {
                  canDescend = false;
                }
              }
              if (visited.has(targetReal)) {
                canDescend = false;
              } else {
                visited.add(targetReal);
              }
            }
          } catch (err) {
            const error = mapFsError(err, ErrorStage.STAT);
            nodeErrors.push(error);
            sink.onError(error);
            recordError(coverageIndex, error);
            canDescend = false;
          }
        }
      }

      const node = this.observedNodeFromStat(root, vpath, stat, kind, runId, nodeErrors);
      emitNode(node);

      if (kind === NodeKind.FILE && req.policy.archivePolicy.includeArchives) {
        await this.scanArchiveIfNeeded(
          root,
          vpath,
          runId,
          req.policy,
          ignoreMatcher,
          emitNode,
          nesting,
          sink,
          (error) => recordError(coverageIndex, error)
        );
      }

      const shouldDescend = (kind === NodeKind.DIR) || (stat.isSymbolicLink() && canDescend);
      if (!shouldDescend) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(osPath, { withFileTypes: true });
      } catch (err) {
        const error = mapFsError(err, ErrorStage.LIST);
        node.errors.push(error);
        sink.onError(error);
        recordError(coverageIndex, error);
        return;
      }

      for (const entry of entries) {
        const childVPath = appendVPath(vpath, entry.name);
        if (scopeMode === ScopeMode.CHILDREN_ONLY) {
          await scanFileSystem(childVPath, scopeMode, false, nesting, coverageIndex);
        } else {
          await scanFileSystem(childVPath, scopeMode, true, nesting, coverageIndex);
        }
      }
    };

    const runScan = async () => {
      sink.onRunStarted(run);
      await scanFileSystem('/', ScopeMode.SINGLE_NODE, false, 0, null);
      for (let i = 0; i < req.scopes.length; i += 1) {
        if (canceled) {
          coverageTracker.markRemainingPartial(i);
          break;
        }
        const scope = req.scopes[i];
        const base = scope.baseVPath;
        if (scope.mode === ScopeMode.SINGLE_NODE) {
          await scanFileSystem(base, scope.mode, false, 0, i);
        } else if (scope.mode === ScopeMode.CHILDREN_ONLY) {
          await scanFileSystem(base, scope.mode, true, 0, i);
        } else {
          await scanFileSystem(base, scope.mode, true, 0, i);
        }
      }
      flush();
      run.status = failed ? RunStatus.FAILED : canceled ? RunStatus.CANCELED : RunStatus.FINISHED;
      run.finishedAt = nowInstant();
      const coverage: Coverage = coverageTracker.finalize();
      sink.onRunFinished(run, coverage);
    };

    void runScan();
    return { run, control };
  }

  private observedNodeFromStat(
    root: RootDescriptor,
    vpath: VPath,
    stat: fs.Stats,
    kind: NodeKind,
    runId: string,
    errors: any[] = []
  ): ObservedNode {
    const name = vpath === '/' ? '' : path.posix.basename(vpath);
    const identity = identityFromStat(root, stat);
    const layers: VfsLayer[] = [{ kind: LayerKind.OS, rootId: root.rootId }];
    return {
      ref: { rootId: root.rootId, layers, vpath },
      kind,
      name,
      size: kind === NodeKind.FILE ? stat.size : undefined,
      mtime: stat.mtime.toISOString(),
      ctime: stat.ctime.toISOString(),
      birthtime: stat.birthtime.toISOString(),
      identity,
      hashes: {},
      extras: {},
      observedInRunId: runId,
      lastObservedAt: nowInstant(),
      errors
    };
  }

  private errorNode(vpath: VPath, root: RootDescriptor, runId: string, error: any): ObservedNode {
    const identity = { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
    return {
      ref: { rootId: root.rootId, layers: [{ kind: LayerKind.OS, rootId: root.rootId }], vpath },
      kind: NodeKind.SPECIAL,
      name: vpath === '/' ? '' : path.posix.basename(vpath),
      identity,
      hashes: {},
      extras: {},
      observedInRunId: runId,
      lastObservedAt: nowInstant(),
      errors: [error]
    };
  }

  private async scanArchiveIfNeeded(
    root: RootDescriptor,
    vpath: VPath,
    runId: string,
    policy: ScanPolicy,
    ignore: IgnoreMatcher,
    emitNode: (node: ObservedNode) => void,
    nesting: number,
    sink: ScanSink,
    recordError: (error: any) => void
  ): Promise<void> {
    const format = guessArchiveFormat(vpath);
    if (!format) return;
    if (!policy.archivePolicy.formats.map((f) => f.toLowerCase()).includes(format)) return;
    if (nesting >= policy.archivePolicy.maxNesting) return;
    const reader = this.archives.getReader(format);
    if (!reader) return;

    try {
      const osPath = vpathToOsPath(root, vpath);
      const handle = await reader.open({ path: osPath }, format);
      const archiveLayers: VfsLayer[] = [
        { kind: LayerKind.OS, rootId: root.rootId },
        { kind: LayerKind.ARCHIVE, format, containerVPath: vpath }
      ];
      const archiveRoot: ObservedNode = {
        ref: { rootId: root.rootId, layers: archiveLayers, vpath: '/' },
        kind: NodeKind.DIR,
        name: '',
        identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
        hashes: {},
        extras: {},
        observedInRunId: runId,
        lastObservedAt: nowInstant(),
        errors: []
      };
      if (!ignore.isIgnored('/')) {
        emitNode(archiveRoot);
      }

      for (const entry of handle.listEntries('/')) {
        if (ignore.isIgnored(entry.entryVPath)) continue;
        const entryNode: ObservedNode = {
          ref: { rootId: root.rootId, layers: archiveLayers, vpath: entry.entryVPath },
          kind: entry.kind,
          name: path.posix.basename(entry.entryVPath),
          size: entry.size,
          mtime: entry.mtime,
          identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
          hashes: {},
          extras: {},
          observedInRunId: runId,
          lastObservedAt: nowInstant(),
          errors: []
        };
        emitNode(entryNode);

        if (entry.kind === NodeKind.FILE && policy.archivePolicy.includeArchives && nesting + 1 < policy.archivePolicy.maxNesting) {
          const nestedFormat = guessArchiveFormat(entry.entryVPath);
          if (nestedFormat && policy.archivePolicy.formats.map((f) => f.toLowerCase()).includes(nestedFormat)) {
            const nestedReader = this.archives.getReader(nestedFormat);
            if (nestedReader) {
              const stream = await handle.openEntryStream(entry.entryVPath);
              const buffer = await readStreamToBuffer(stream);
              const nestedHandle = await nestedReader.open({ buffer }, nestedFormat);
              const nestedLayers: VfsLayer[] = [
                ...archiveLayers,
                { kind: LayerKind.ARCHIVE, format: nestedFormat, containerVPath: entry.entryVPath }
              ];
              const nestedRoot: ObservedNode = {
                ref: { rootId: root.rootId, layers: nestedLayers, vpath: '/' },
                kind: NodeKind.DIR,
                name: '',
                identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
                hashes: {},
                extras: {},
                observedInRunId: runId,
                lastObservedAt: nowInstant(),
                errors: []
              };
              emitNode(nestedRoot);
              for (const nestedEntry of nestedHandle.listEntries('/')) {
                if (ignore.isIgnored(nestedEntry.entryVPath)) continue;
                emitNode({
                  ref: { rootId: root.rootId, layers: nestedLayers, vpath: nestedEntry.entryVPath },
                  kind: nestedEntry.kind,
                  name: path.posix.basename(nestedEntry.entryVPath),
                  size: nestedEntry.size,
                  mtime: nestedEntry.mtime,
                  identity: { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
                  hashes: {},
                  extras: {},
                  observedInRunId: runId,
                  lastObservedAt: nowInstant(),
                  errors: []
                });
              }
              nestedHandle.close();
            }
          }
        }
      }
      if (handle.errors) {
        for (const err of handle.errors) {
          const rawCode = (err as any).code;
          const isKnownCode = Object.values(ErrorCode).includes(rawCode);
          const error = isKnownCode
            ? { code: rawCode, stage: ErrorStage.ARCHIVE_LIST, message: err.message, retryable: false, at: nowInstant() }
            : mapFsError(err, ErrorStage.ARCHIVE_LIST);
          sink.onError(error);
          recordError(error);
        }
      }
      handle.close();
    } catch (err) {
      const error = mapFsError(err, ErrorStage.ARCHIVE_LIST);
      sink.onError(error);
      recordError(error);
    }
    return;
  }
}
