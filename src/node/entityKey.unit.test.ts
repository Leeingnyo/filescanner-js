import { describe, expect, it } from 'vitest';
import { deriveEntityKey } from './entityKey.js';
import { IdentityPlatform, CasePolicy } from '../types/enums.js';
import { LayerKind } from '../types/layers.js';

describe('deriveEntityKey', () => {
  it('uses identity when available', () => {
    const key = deriveEntityKey(
      { platform: IdentityPlatform.POSIX, posix: { dev: 12, inode: 34 }, isAvailable: true },
      { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/a' },
      CasePolicy.SENSITIVE
    );
    expect(key).toBe('posix:12:34');
  });

  it('falls back to path with vpathFold for insensitive', () => {
    const key = deriveEntityKey(
      { platform: IdentityPlatform.UNKNOWN, isAvailable: false },
      { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/A' },
      CasePolicy.INSENSITIVE
    );
    expect(key).toContain('path:r:1:');
    expect(key.endsWith(':/a')).toBe(true);
  });
});
