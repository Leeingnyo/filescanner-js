import type { VPath } from '../types/ids.js';
import { encodeVPathSegment } from './encode.js';

export function appendVPath(parent: VPath, name: string): VPath {
  const segment = encodeVPathSegment(name);
  if (parent === '/') {
    return `/${segment}` as VPath;
  }
  return `${parent}/${segment}` as VPath;
}
