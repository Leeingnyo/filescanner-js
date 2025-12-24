import fs from 'node:fs';
import path from 'node:path';
import type { Vfs } from './Vfs.js';
import type { NodeRef } from '../types/noderef.js';
import type { NodeMeta } from '../types/nodeMeta.js';
import type { RootResolver } from '../root/RootResolver.js';
import { NodeKind, IdentityPlatform } from '../types/enums.js';
import type { VPath } from '../types/ids.js';
import { appendVPath } from '../vpath/build.js';
import { vpathToOsPath } from '../root/osPath.js';
import { deriveEntityKey } from '../node/entityKey.js';
import { resolveCasePolicy } from '../root/casePolicy.js';
import { ArchiveRegistry } from '../archive/ArchiveRegistry.js';
import type { ArchiveHandle } from '../archive/types.js';
import type { VfsLayerArchive } from '../types/layers.js';
import { LayerKind } from '../types/layers.js';
import { readStreamToBuffer } from '../utils/streams.js';

export class DefaultVfs implements Vfs {
  constructor(private readonly roots: RootResolver, private readonly archives: ArchiveRegistry) {}

  async listChildren(ref: NodeRef): Promise<NodeRef[]> {
    if (ref.layers.length === 1) {
      return this.listOsChildren(ref);
    }
    return this.listArchiveChildren(ref);
  }

  async stat(ref: NodeRef): Promise<NodeMeta> {
    if (ref.layers.length === 1) {
      return this.statOs(ref);
    }
    return this.statArchive(ref);
  }

  async openRead(ref: NodeRef): Promise<NodeJS.ReadableStream> {
    if (ref.layers.length === 1) {
      return fs.createReadStream(this.osPathFor(ref));
    }
    const { handle } = await this.openArchiveHandle(ref);
    return handle.openEntryStream(ref.vpath);
  }

  async openReadRange(ref: NodeRef, offset: number, length: number): Promise<NodeJS.ReadableStream> {
    if (ref.layers.length === 1) {
      return fs.createReadStream(this.osPathFor(ref), { start: offset, end: offset + length - 1 });
    }
    const { handle } = await this.openArchiveHandle(ref);
    if (handle.openEntryRange) {
      return handle.openEntryRange(ref.vpath, offset, length);
    }
    return handle.openEntryStream(ref.vpath);
  }

  private listOsChildren(ref: NodeRef): NodeRef[] {
    const root = this.roots.getRoot(ref.rootId);
    const basePath = this.osPathFor(ref);
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const nodes: NodeRef[] = [];
    for (const entry of entries) {
      const childVPath = appendVPath(ref.vpath as VPath, entry.name);
      nodes.push({ rootId: ref.rootId, layers: ref.layers, vpath: childVPath });
    }
    return nodes;
  }

  private async listArchiveChildren(ref: NodeRef): Promise<NodeRef[]> {
    const { handle } = await this.openArchiveHandle(ref);
    const entries = Array.from(handle.listEntries(ref.vpath));
    const childMap = new Map<VPath, NodeKind>();
    for (const entry of entries) {
      const relative = entry.entryVPath === ref.vpath ? '' : entry.entryVPath.slice(ref.vpath.length + (ref.vpath === '/' ? 0 : 1));
      if (relative.length === 0) continue;
      const firstSegment = relative.split('/')[0];
      const childVPath = ref.vpath === '/' ? (`/${firstSegment}` as VPath) : (`${ref.vpath}/${firstSegment}` as VPath);
      const existing = childMap.get(childVPath);
      if (existing) continue;
      if (entry.entryVPath === childVPath) {
        childMap.set(childVPath, entry.kind);
      } else {
        childMap.set(childVPath, NodeKind.DIR);
      }
    }
    return Array.from(childMap.keys()).map((vpath) => ({ rootId: ref.rootId, layers: ref.layers, vpath }));
  }

  private statOs(ref: NodeRef): NodeMeta {
    const root = this.roots.getRoot(ref.rootId);
    const stat = fs.lstatSync(this.osPathFor(ref));
    const kind = stat.isDirectory()
      ? NodeKind.DIR
      : stat.isFile()
        ? NodeKind.FILE
        : stat.isSymbolicLink()
          ? NodeKind.SYMLINK
          : NodeKind.SPECIAL;
    const identity = { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
    const casePolicy = resolveCasePolicy(root.casePolicy, root.capabilities);
    const entityKey = deriveEntityKey(identity, ref, casePolicy);
    return {
      nodeId: '',
      ref,
      kind,
      name: path.basename(this.osPathFor(ref)),
      size: stat.isFile() ? stat.size : undefined,
      mtime: stat.mtime.toISOString(),
      ctime: stat.ctime.toISOString(),
      birthtime: stat.birthtime.toISOString(),
      identity,
      entityKey,
      firstSeenAt: new Date().toISOString(),
      isDeleted: false,
      hashes: {},
      extras: {},
      observedInRunId: '',
      lastObservedAt: new Date().toISOString(),
      errors: []
    };
  }

  private async statArchive(ref: NodeRef): Promise<NodeMeta> {
    const { handle } = await this.openArchiveHandle(ref);
    let entry;
    try {
      entry = handle.statEntry(ref.vpath);
    } catch {
      if (ref.vpath === '/') {
        entry = { entryVPath: '/', kind: NodeKind.DIR };
      } else {
        throw new Error('Archive entry not found');
      }
    }
    const identity = { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
    const root = this.roots.getRoot(ref.rootId);
    const casePolicy = resolveCasePolicy(root.casePolicy, root.capabilities);
    const entityKey = deriveEntityKey(identity, ref, casePolicy);
    return {
      nodeId: '',
      ref,
      kind: entry.kind,
      name: path.posix.basename(entry.entryVPath),
      size: entry.size,
      mtime: entry.mtime,
      identity,
      entityKey,
      firstSeenAt: new Date().toISOString(),
      isDeleted: false,
      hashes: {},
      extras: {},
      observedInRunId: '',
      lastObservedAt: new Date().toISOString(),
      errors: []
    };
  }

  private osPathFor(ref: NodeRef): string {
    const root = this.roots.getRoot(ref.rootId);
    return vpathToOsPath(root, ref.vpath as VPath);
  }

  private async openArchiveHandle(ref: NodeRef): Promise<{ handle: ArchiveHandle }> {
    if (ref.layers.length < 2) {
      throw new Error('Archive layer required');
    }
    const archiveLayers = ref.layers.filter((layer) => layer.kind === LayerKind.ARCHIVE) as VfsLayerArchive[];
    let source: { path?: string; buffer?: Buffer; stream?: NodeJS.ReadableStream };
    const root = this.roots.getRoot(ref.rootId);

    const first = archiveLayers[0];
    const osPath = vpathToOsPath(root, first.containerVPath as VPath);
    source = { path: osPath };

    for (let i = 0; i < archiveLayers.length; i += 1) {
      const layer = archiveLayers[i];
      const reader = this.archives.getReader(layer.format);
      if (!reader) {
        throw new Error(`Unsupported archive format: ${layer.format}`);
      }
      const handle = await reader.open(source as any, layer.format);
      if (i === archiveLayers.length - 1) {
        return { handle };
      }
      const nextLayer = archiveLayers[i + 1];
      const stream = await handle.openEntryStream(nextLayer.containerVPath as VPath);
      const buffer = await readStreamToBuffer(stream);
      handle.close();
      source = { buffer };
    }
    throw new Error('Invalid archive layers');
  }
}
