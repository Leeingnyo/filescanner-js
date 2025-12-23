import { describe, expect, it } from 'vitest';
import { encodeVPathSegment } from '../../src/vpath/encode.js';
import { normalizeVPath, VPathError, joinVPath } from '../../src/vpath/normalize.js';
import { vpathFold } from '../../src/vpath/fold.js';
import { ErrorCode } from '../../src/types/enums.js';

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
});

describe('joinVPath', () => {
  it('joins with single separator', () => {
    expect(joinVPath('/a', '/b')).toBe('/a/b');
    expect(joinVPath('/', '/b')).toBe('/b');
    expect(joinVPath('/a', '/')).toBe('/a');
  });
});

describe('vpathFold', () => {
  it('folds ASCII only', () => {
    expect(vpathFold('/A/%C3%89')).toBe('/a/%C3%89');
  });
});
