import { describe, expect, it } from 'vitest';
import { identityValue, normalizeWindowsFileId, normalizeWindowsVolumeId } from './identityKey.js';
import { IdentityPlatform } from '../types/enums.js';

describe('identityKey', () => {
  it('normalizes windows identifiers', () => {
    expect(normalizeWindowsVolumeId('ABC-DEF')).toBe('abc-def');
    expect(normalizeWindowsFileId('ab')).toBe('000000000000000000000000000000ab');
  });

  it('builds canonical identity strings', () => {
    const win = identityValue({
      platform: IdentityPlatform.WINDOWS,
      windows: { volumeId: 'ABC', fileId: 'ff' },
      isAvailable: true
    });
    expect(win).toBe('win:abc:000000000000000000000000000000ff');

    const posix = identityValue({
      platform: IdentityPlatform.POSIX,
      posix: { dev: 7, inode: 9 },
      isAvailable: true
    });
    expect(posix).toBe('posix:7:9');

    const none = identityValue({ platform: IdentityPlatform.UNKNOWN, isAvailable: false });
    expect(none).toBeNull();
  });
});

