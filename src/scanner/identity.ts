import type { Stats } from 'node:fs';
import type { RootDescriptor } from '../types/root.js';
import type { FileIdentity } from '../types/identity.js';
import { IdentityPlatform, OsKind } from '../types/enums.js';

export function identityFromStat(root: RootDescriptor, stat: Stats): FileIdentity {
  if (!root.capabilities.supportsFileId) {
    return { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
  }
  if (root.os === OsKind.POSIX) {
    const dev = stat.dev;
    const inode = stat.ino;
    if (Number.isFinite(dev) && Number.isFinite(inode)) {
      return { platform: IdentityPlatform.POSIX, posix: { dev, inode }, isAvailable: true };
    }
  }
  return { platform: IdentityPlatform.UNKNOWN, isAvailable: false };
}
