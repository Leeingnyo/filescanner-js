import { describe, expect, it } from 'vitest';
import { asciiFold } from '../../src/utils/asciiFold.js';
import { sha256HexUtf8 } from '../../src/utils/crypto.js';
import { utf8ByteCompare } from '../../src/utils/utf8.js';

describe('asciiFold', () => {
  it('folds ASCII letters only', () => {
    expect(asciiFold('AbC-_.%')).toBe('abc-_.%');
    expect(asciiFold('ÅßÇ')).toBe('ÅßÇ');
  });
});

describe('sha256', () => {
  it('hashes deterministically', () => {
    expect(sha256HexUtf8('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });
});

describe('utf8ByteCompare', () => {
  it('compares by unsigned byte order', () => {
    expect(utf8ByteCompare('a', 'b')).toBeLessThan(0);
    expect(utf8ByteCompare('b', 'a')).toBeGreaterThan(0);
    expect(utf8ByteCompare('a', 'a')).toBe(0);
    expect(utf8ByteCompare('a', 'aa')).toBeLessThan(0);
  });
});
