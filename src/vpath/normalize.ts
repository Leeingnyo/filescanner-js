import { ErrorCode } from '../types/enums.js';
import type { VPath } from '../types/ids.js';

export class VPathError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeVPath(value: string): VPath {
  if (!value.startsWith('/')) {
    throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'VPath must start with "/"');
  }
  if (value === '/') {
    return '/';
  }
  const parts = value.split('/');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.length === 0) {
      throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'VPath contains empty segment');
    }
    if (part === '.') {
      continue;
    }
    if (part === '..') {
      throw new VPathError(ErrorCode.INVALID_VPATH_PARENT_SEGMENT, 'VPath parent segment not allowed');
    }
    out.push(part);
  }
  return out.length === 0 ? '/' : `/${out.join('/')}`;
}

export function joinVPath(a: VPath, b: VPath): VPath {
  if (a === '/') return b;
  if (b === '/') return a;
  return `${a}${b}` as VPath;
}

export function parentVPath(vpath: VPath): VPath | null {
  if (vpath === '/') return null;
  const idx = vpath.lastIndexOf('/');
  if (idx <= 0) return '/';
  return vpath.slice(0, idx) as VPath;
}

export function isImmediateChild(parent: VPath, child: VPath): boolean {
  if (parent === '/') {
    if (!child.startsWith('/')) return false;
    const rest = child.slice(1);
    return rest.length > 0 && !rest.includes('/');
  }
  if (!child.startsWith(`${parent}/`)) return false;
  const rest = child.slice(parent.length + 1);
  return rest.length > 0 && !rest.includes('/');
}
