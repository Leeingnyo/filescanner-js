import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Executor, ExecutionSink, OperationPlan, Operation, OpResult, ExecutionReport, ExecControl } from '../types/operations.js';
import { ConflictPolicy, OpStatus, OpType } from '../types/operations.js';
import { nowInstant } from '../utils/time.js';
import { mapFsError } from '../scanner/errorMapper.js';
import { ErrorStage } from '../types/enums.js';
import type { RootResolver } from '../root/RootResolver.js';
import { vpathToOsPath } from '../root/osPath.js';
import { DefaultVfs } from '../vfs/DefaultVfs.js';
import { ArchiveRegistry } from '../archive/ArchiveRegistry.js';

export class FileExecutor implements Executor {
  private readonly vfs: DefaultVfs;

  constructor(private readonly roots: RootResolver, archives: ArchiveRegistry) {
    this.vfs = new DefaultVfs(roots, archives);
  }

  async dryRun(plan: OperationPlan): Promise<OperationPlan> {
    const conflicts: string[] = [];
    const missingSources: string[] = [];
    let bytesToCopy = 0;

    for (const op of plan.ops) {
      if (op.type === OpType.COPY || op.type === OpType.MOVE) {
        if (!op.src) continue;
        const srcExists = this.sourceExists(op);
        if (!srcExists) missingSources.push(op.opId);
        const size = this.sourceSize(op);
        if (size !== undefined) bytesToCopy += size;
        if (op.dst) {
          const destPath = this.destPath(op.dst.rootId, op.dst.vpath);
          if (fs.existsSync(destPath) && op.policy.conflict !== ConflictPolicy.RENAME) {
            conflicts.push(destPath);
          }
        }
      }
      if (op.type === OpType.MKDIR && op.dst) {
        const destPath = this.destPath(op.dst.rootId, op.dst.vpath);
        if (fs.existsSync(destPath)) {
          conflicts.push(destPath);
        }
      }
    }

    return {
      ...plan,
      preflight: {
        conflicts,
        missingSources,
        estimates: { bytesToCopy, opCount: plan.ops.length }
      }
    };
  }

  async execute(plan: OperationPlan, sink: ExecutionSink): Promise<{ report: ExecutionReport; control: ExecControl }> {
    let canceled = false;
    const control = {
      cancel() {
        canceled = true;
      }
    };

    const results: OpResult[] = [];
    const startedAt = nowInstant();
    sink.onStarted(plan);

    for (const op of plan.ops) {
      if (canceled) break;
      sink.onOpStarted(op);
      let result: OpResult = { opId: op.opId, status: OpStatus.OK };
      try {
        if (op.type === OpType.MKDIR) {
          await this.executeMkdir(op);
        } else if (op.type === OpType.DELETE) {
          await this.executeDelete(op);
        } else if (op.type === OpType.COPY) {
          result = await this.executeCopy(op);
        } else if (op.type === OpType.MOVE) {
          result = await this.executeMove(op);
        }
      } catch (err) {
        const error = mapFsError(err, ErrorStage.EXECUTE);
        sink.onError(error);
        result = { opId: op.opId, status: OpStatus.FAILED, error };
      }
      results.push(result);
      sink.onOpFinished(op, result);
    }

    const report = { startedAt, finishedAt: nowInstant(), results };
    sink.onFinished(report);
    return { report, control };
  }

  private async executeMkdir(op: Operation): Promise<void> {
    if (!op.dst) return;
    const destPath = this.resolveConflictPath(op, op.dst.rootId, op.dst.vpath);
    fs.mkdirSync(destPath, { recursive: true });
  }

  private async executeDelete(op: Operation): Promise<void> {
    if (!op.src) return;
    if (op.src.layers.length !== 1) {
      throw new Error('DELETE requires OS layer source');
    }
    const root = this.roots.getRoot(op.src.rootId);
    const srcPath = vpathToOsPath(root, op.src.vpath);
    fs.rmSync(srcPath, { recursive: true, force: true });
  }

  private async executeCopy(op: Operation): Promise<OpResult> {
    if (!op.src || !op.dst) return { opId: op.opId, status: OpStatus.FAILED };
    const destPath = this.resolveConflictPath(op, op.dst.rootId, op.dst.vpath);
    if (destPath === '__SKIP__') return { opId: op.opId, status: OpStatus.SKIPPED };
    const root = this.roots.getRoot(op.dst.rootId);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const stream = await this.readSourceStream(op);
    const out = fs.createWriteStream(destPath);
    await pipeline(stream, out);
    return { opId: op.opId, status: OpStatus.OK };
  }

  private async executeMove(op: Operation): Promise<OpResult> {
    if (!op.src || !op.dst) return { opId: op.opId, status: OpStatus.FAILED };
    if (op.src.layers.length !== 1) {
      throw new Error('MOVE requires OS layer source');
    }
    const destPath = this.resolveConflictPath(op, op.dst.rootId, op.dst.vpath);
    if (destPath === '__SKIP__') return { opId: op.opId, status: OpStatus.SKIPPED };

    const root = this.roots.getRoot(op.src.rootId);
    const srcPath = vpathToOsPath(root, op.src.vpath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.renameSync(srcPath, destPath);
    return { opId: op.opId, status: OpStatus.OK };
  }

  private resolveConflictPath(op: Operation, rootId: string, vpath: string): string {
    const destPath = this.destPath(rootId, vpath);
    if (!fs.existsSync(destPath)) return destPath;
    if (op.policy.conflict === ConflictPolicy.SKIP) return '__SKIP__';
    if (op.policy.conflict === ConflictPolicy.FAIL) {
      throw new Error('Conflict');
    }
    if (op.policy.conflict === ConflictPolicy.OVERWRITE) {
      fs.rmSync(destPath, { recursive: true, force: true });
      return destPath;
    }
    return this.nextAvailablePath(destPath);
  }

  private nextAvailablePath(destPath: string): string {
    const parsed = path.parse(destPath);
    let n = 1;
    while (true) {
      const name = parsed.ext ? `${parsed.name} (${n})${parsed.ext}` : `${parsed.name} (${n})`;
      const candidate = path.join(parsed.dir, name);
      if (!fs.existsSync(candidate)) return candidate;
      n += 1;
    }
  }

  private async readSourceStream(op: Operation): Promise<NodeJS.ReadableStream> {
    if (!op.src) throw new Error('Missing source');
    if (op.src.layers.length === 1) {
      const root = this.roots.getRoot(op.src.rootId);
      const srcPath = vpathToOsPath(root, op.src.vpath);
      return fs.createReadStream(srcPath);
    }
    return this.vfs.openRead(op.src);
  }

  private sourceExists(op: Operation): boolean {
    if (!op.src) return false;
    if (op.src.layers.length !== 1) return true;
    const root = this.roots.getRoot(op.src.rootId);
    const srcPath = vpathToOsPath(root, op.src.vpath);
    return fs.existsSync(srcPath);
  }

  private sourceSize(op: Operation): number | undefined {
    if (!op.src) return undefined;
    if (op.src.layers.length !== 1) return undefined;
    const root = this.roots.getRoot(op.src.rootId);
    const srcPath = vpathToOsPath(root, op.src.vpath);
    try {
      const stat = fs.statSync(srcPath);
      return stat.size;
    } catch {
      return undefined;
    }
  }

  private destPath(rootId: string, vpath: string): string {
    const root = this.roots.getRoot(rootId);
    return vpathToOsPath(root, vpath);
  }
}
