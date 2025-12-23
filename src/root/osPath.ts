import path from 'node:path';
import type { RootDescriptor } from '../types/root.js';
import type { OsPath, VPath } from '../types/ids.js';
import { OsKind } from '../types/enums.js';
import { decodeVPathSegments } from '../vpath/decode.js';

export function vpathToOsPath(root: RootDescriptor, vpath: VPath): OsPath {
  const segments = decodeVPathSegments(vpath);
  if (root.os === OsKind.WINDOWS) {
    return path.win32.join(root.osPath, ...segments) as OsPath;
  }
  return path.posix.join(root.osPath, ...segments) as OsPath;
}
