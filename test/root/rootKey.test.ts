import { describe, expect, it } from 'vitest';
import { normalizeRootKey } from '../../src/root/normalizeRootKey.js';
import { OsKind } from '../../src/types/enums.js';

describe('normalizeRootKey', () => {
  it('normalizes posix paths', () => {
    const key = normalizeRootKey('/tmp//foo/../bar/', OsKind.POSIX);
    expect(key).toBe('posixpath:/tmp/bar');
  });

  it('normalizes windows paths and strips long prefix', () => {
    const key = normalizeRootKey('\\\\?\\C:\\foo\\..\\bar\\', OsKind.WINDOWS);
    expect(key).toBe('winpath:C:\\bar');
  });

  it('normalizes UNC long paths', () => {
    const key = normalizeRootKey('\\\\?\\UNC\\server\\share\\dir\\', OsKind.WINDOWS);
    expect(key).toBe('winpath:\\\\server\\share\\dir');
  });
});
