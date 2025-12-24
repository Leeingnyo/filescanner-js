import { ErrorCode } from '../types/enums.js';
import type { NodeRef } from '../types/noderef.js';
import { LayerKind, type VfsLayer } from '../types/layers.js';
import { normalizeVPath, VPathError } from '../vpath/normalize.js';
import { guessArchiveFormat } from '../archive/format.js';

export class CanonicalRefError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function toCanonicalString(ref: NodeRef): string {
  if (ref.layers.length === 0 || ref.layers[0].kind !== LayerKind.OS) {
    throw new CanonicalRefError(ErrorCode.INVALID_VPATH_FORMAT, 'NodeRef layers must start with OS');
  }
  const parts: string[] = [];
  const archiveLayers = ref.layers.filter((layer) => layer.kind === LayerKind.ARCHIVE);
  if (archiveLayers.length === 0) {
    parts.push(ref.vpath);
  } else {
    for (const layer of archiveLayers) {
      parts.push(layer.containerVPath);
    }
    parts.push(ref.vpath);
  }
  return `root:${ref.rootId}:${parts.join('!')}`;
}

export function parseCanonicalString(value: string): NodeRef {
  if (!value.startsWith('root:')) {
    throw new CanonicalRefError(ErrorCode.INVALID_VPATH_FORMAT, 'Canonical string must start with root:');
  }
  const delim = value.indexOf(':/', 5);
  if (delim === -1) {
    throw new CanonicalRefError(ErrorCode.INVALID_VPATH_FORMAT, 'Canonical string missing ":/" delimiter');
  }
  const rootId = value.slice(5, delim);
  if (rootId.length === 0) {
    throw new CanonicalRefError(ErrorCode.INVALID_VPATH_FORMAT, 'rootId cannot be empty');
  }
  const rest = value.slice(delim + 1);
  const parts = rest.split('!');
  const layers: VfsLayer[] = [{ kind: LayerKind.OS, rootId }];
  for (let i = 1; i < parts.length; i += 1) {
    const container = normalizeVPath(parts[i - 1]);
    layers.push({
      kind: LayerKind.ARCHIVE,
      format: guessArchiveFormat(container),
      containerVPath: container
    });
  }
  let vpath: string;
  try {
    vpath = normalizeVPath(parts[parts.length - 1]);
  } catch (err) {
    if (err instanceof VPathError) {
      throw err;
    }
    throw new CanonicalRefError(ErrorCode.INVALID_VPATH_FORMAT, 'Invalid vpath in canonical string');
  }
  return { rootId, layers, vpath };
}
