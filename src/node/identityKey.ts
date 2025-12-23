import { IdentityPlatform } from '../types/enums.js';
import type { FileIdentity } from '../types/identity.js';

export function normalizeWindowsVolumeId(value: string): string {
  return value.toLowerCase();
}

export function normalizeWindowsFileId(value: string): string {
  return value.toLowerCase().padStart(32, '0');
}

export function identityValue(identity: FileIdentity): string | null {
  if (!identity.isAvailable) return null;
  if (identity.platform === IdentityPlatform.WINDOWS && identity.windows) {
    const volumeId = normalizeWindowsVolumeId(identity.windows.volumeId);
    const fileId = normalizeWindowsFileId(identity.windows.fileId);
    return `win:${volumeId}:${fileId}`;
  }
  if (identity.platform === IdentityPlatform.POSIX && identity.posix) {
    return `posix:${identity.posix.dev}:${identity.posix.inode}`;
  }
  return null;
}
