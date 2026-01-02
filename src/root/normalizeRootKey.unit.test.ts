import { describe, expect, it } from 'vitest';
import { normalizeRootKey } from './normalizeRootKey.js';
import { OsKind } from '../types/enums.js';

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

  it('normalizes drive letter and trailing slash', () => {
    const key = normalizeRootKey('c:\\Foo\\', OsKind.WINDOWS);
    expect(key).toBe('winpath:C:\\Foo');
  });

  it('normalizes UNC paths and trims trailing slash', () => {
    const key = normalizeRootKey('\\\\server\\share\\dir\\', OsKind.WINDOWS);
    expect(key).toBe('winpath:\\\\server\\share\\dir');
  });
});
