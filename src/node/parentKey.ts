import type { NodeRef } from '../types/noderef.js';
import type { VPath } from '../types/ids.js';
import { parentVPath } from '../vpath/normalize.js';
import { toCanonicalString } from './canonical.js';
import { sha256HexUtf8 } from '../utils/crypto.js';

export function parentRefOf(ref: NodeRef): NodeRef | null {
  const parentV = parentVPath(ref.vpath as VPath);
  if (!parentV) return null;
  return { rootId: ref.rootId, layers: ref.layers, vpath: parentV };
}

export function parentKeyOf(ref: NodeRef): string {
  const parent = parentRefOf(ref);
  if (!parent) return '';
  const canon = toCanonicalString(parent);
  return `pk:${sha256HexUtf8(canon)}`;
}

export function parentKeyFor(ref: NodeRef): string {
  const canon = toCanonicalString(ref);
  return `pk:${sha256HexUtf8(canon)}`;
}
