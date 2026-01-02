import { describe, expect, it } from 'vitest';
import { encodeVPathSegment, encodeVPathSegments } from './encode.js';
import { decodeVPathSegment, decodeVPathSegments } from './decode.js';
import { normalizeVPath, VPathError, joinVPath, parentVPath, isImmediateChild } from './normalize.js';
import { vpathFold } from './fold.js';
import { ErrorCode } from '../types/enums.js';

describe('encodeVPathSegment', () => {
  it('percent-encodes reserved bytes with uppercase hex', () => {
    expect(encodeVPathSegment(' ')).toBe('%20');
    expect(encodeVPathSegment('%')).toBe('%25');
    expect(encodeVPathSegment('!')).toBe('%21');
    expect(encodeVPathSegment('/')).toBe('%2F');
  });

  it('encodes UTF-8 bytes', () => {
    expect(encodeVPathSegment('é')).toBe('%C3%A9');
  });
});

describe('encodeVPathSegments', () => {
  it('joins encoded segments with a leading slash', () => {
    expect(encodeVPathSegments(['a b', 'c'])).toBe('/a%20b/c');
  });

  it('encodes empty path as root', () => {
    expect(encodeVPathSegments([])).toBe('/');
  });
});

describe('decodeVPathSegment', () => {
  it('throws on invalid percent encoding', () => {
    expect(() => decodeVPathSegment('%2')).toThrowError(VPathError);
    expect(() => decodeVPathSegment('%ZZ')).toThrowError(VPathError);
  });
});

describe('decodeVPathSegments', () => {
  it('rejects missing leading slash', () => {
    expect(() => decodeVPathSegments('a/b' as any)).toThrowError(VPathError);
  });

  it('rejects empty segments', () => {
    expect(() => decodeVPathSegments('/a//b' as any)).toThrowError(VPathError);
  });
});

describe('normalizeVPath', () => {
  it('normalizes dot segments', () => {
    expect(normalizeVPath('/a/./b')).toBe('/a/b');
  });

  it('rejects parent segments', () => {
    expect(() => normalizeVPath('/a/../b')).toThrowError(VPathError);
    try {
      normalizeVPath('/a/../b');
    } catch (err) {
      expect((err as VPathError).code).toBe(ErrorCode.INVALID_VPATH_PARENT_SEGMENT);
    }
  });

  it('rejects empty segments', () => {
    expect(() => normalizeVPath('/a//b')).toThrowError(VPathError);
    expect(() => normalizeVPath('/a/')).toThrowError(VPathError);
  });

  it('rejects non-root without leading slash', () => {
    expect(() => normalizeVPath('a/b')).toThrowError(VPathError);
  });

  it('normalizes the root path', () => {
    expect(normalizeVPath('/')).toBe('/');
  });
});

describe('joinVPath', () => {
  it('joins with single separator', () => {
    expect(joinVPath('/a', '/b')).toBe('/a/b');
    expect(joinVPath('/', '/b')).toBe('/b');
    expect(joinVPath('/a', '/')).toBe('/a');
  });
});

describe('parentVPath', () => {
  it('returns parent vpath for children', () => {
    expect(parentVPath('/a/b')).toBe('/a');
    expect(parentVPath('/a')).toBe('/');
  });

  it('returns null for root', () => {
    expect(parentVPath('/')).toBeNull();
  });
});

describe('isImmediateChild', () => {
  it('detects immediate children', () => {
    expect(isImmediateChild('/', '/a')).toBe(true);
    expect(isImmediateChild('/', '/a/b')).toBe(false);
    expect(isImmediateChild('/a', '/a/b')).toBe(true);
    expect(isImmediateChild('/a', '/a/b/c')).toBe(false);
  });
});

describe('vpathFold', () => {
  it('folds ASCII only', () => {
    expect(vpathFold('/A/%C3%89')).toBe('/a/%C3%89');
  });
});

describe('VPath round-trip', () => {
  it('encodes and decodes reserved segments', () => {
    const segments = ['a b', '100%', 'x!y', 'a/b'];
    const encoded = segments.map((segment) => encodeVPathSegment(segment));
    const vpath = normalizeVPath(`/${encoded.join('/')}`);
    const decoded = decodeVPathSegments(vpath);
    expect(decoded).toEqual(segments);
  });
});
