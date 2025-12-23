import type { VPath } from '../types/ids.js';

export function vpathHasPrefix(vpath: VPath, prefix: VPath): boolean {
  if (prefix === '/') return true;
  if (vpath === prefix) return true;
  return vpath.startsWith(`${prefix}/`);
}
