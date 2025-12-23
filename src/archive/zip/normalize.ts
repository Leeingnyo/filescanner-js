import type { VPath } from '../../types/ids.js';
import { ErrorCode } from '../../types/enums.js';
import { encodeVPathSegment } from '../../vpath/encode.js';
import { decodeCp437 } from './cp437.js';

export class ZipEntryError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function decodeZipFileName(raw: Buffer, isUtf8: boolean): string {
  try {
    if (isUtf8) {
      return raw.toString('utf8');
    }
    return decodeCp437(raw);
  } catch (err) {
    throw new ZipEntryError(ErrorCode.ENCODING_ERROR, 'Invalid zip entry encoding');
  }
}

export function normalizeZipPath(name: string): VPath {
  let normalized = name.replace(/\\/g, '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (normalized.startsWith('/')) {
    throw new ZipEntryError(ErrorCode.INVALID_VPATH_FORMAT, 'Absolute zip entry path');
  }
  const rawParts = normalized.split('/');
  const parts: string[] = [];
  for (const part of rawParts) {
    if (part.length === 0) {
      throw new ZipEntryError(ErrorCode.INVALID_VPATH_FORMAT, 'Empty zip entry segment');
    }
    if (part === '..') {
      throw new ZipEntryError(ErrorCode.INVALID_VPATH_PARENT_SEGMENT, 'Zip entry traversal');
    }
    if (part === '.') {
      continue;
    }
    parts.push(encodeVPathSegment(part));
  }
  if (parts.length === 0) {
    return '/';
  }
  return `/${parts.join('/')}` as VPath;
}
