import path from 'node:path';
import type { RootKey } from '../types/ids.js';
import { OsKind } from '../types/enums.js';

const LONG_PATH_PREFIX = '\\\\?\\';
const LONG_UNC_PREFIX = '\\\\?\\UNC\\';

function normalizePosix(osPath: string): string {
  let resolved = path.posix.resolve(osPath);
  resolved = resolved.replace(/\/+/g, '/');
  if (resolved.length > 1 && resolved.endsWith('/')) {
    resolved = resolved.replace(/\/+$/, '');
  }
  return `posixpath:${resolved}`;
}

function normalizeWindows(osPath: string): string {
  let value = osPath;
  if (value.startsWith(LONG_UNC_PREFIX)) {
    value = `\\\\${value.slice(LONG_UNC_PREFIX.length)}`;
  } else if (value.startsWith(LONG_PATH_PREFIX)) {
    value = value.slice(LONG_PATH_PREFIX.length);
  }
  let resolved = path.win32.resolve(value);
  resolved = resolved.replace(/\//g, '\\');
  if (/^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved[0].toUpperCase() + resolved.slice(1);
  }
  if (resolved.length > 3 && resolved.endsWith('\\')) {
    resolved = resolved.replace(/\\+$/, '');
  }
  return `winpath:${resolved}`;
}

export function normalizeRootKey(osPath: string, os: OsKind): RootKey {
  return os === OsKind.WINDOWS ? normalizeWindows(osPath) : normalizePosix(osPath);
}
