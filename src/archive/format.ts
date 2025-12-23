import type { VPath } from '../types/ids.js';

export function guessArchiveFormat(containerVPath: VPath): string {
  const idx = containerVPath.lastIndexOf('.');
  if (idx === -1) return '';
  return containerVPath.slice(idx + 1).toLowerCase();
}
