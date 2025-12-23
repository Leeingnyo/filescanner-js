import type { VPath } from '../types/ids.js';
import { ErrorCode } from '../types/enums.js';
import { VPathError } from './normalize.js';

function hexToByte(hex: string): number {
  const value = Number.parseInt(hex, 16);
  if (Number.isNaN(value)) {
    throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'Invalid percent encoding');
  }
  return value;
}

export function decodeVPathSegment(segment: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === '%') {
      if (i + 2 >= segment.length) {
        throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'Invalid percent encoding');
      }
      const hex = segment.slice(i + 1, i + 3);
      bytes.push(hexToByte(hex));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function decodeVPathSegments(vpath: VPath): string[] {
  if (!vpath.startsWith('/')) {
    throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'VPath must start with /');
  }
  if (vpath === '/') return [];
  const parts = vpath.split('/').slice(1);
  for (const part of parts) {
    if (part.length === 0) {
      throw new VPathError(ErrorCode.INVALID_VPATH_FORMAT, 'VPath contains empty segment');
    }
  }
  return parts.map(decodeVPathSegment);
}
