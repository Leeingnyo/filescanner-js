import { describe, expect, it } from 'vitest';
import { asciiFold } from './asciiFold.js';
import { sha256HexUtf8, sha256Hex } from './crypto.js';
import { utf8ByteCompare, utf8Bytes, byteArrayCompare } from './utf8.js';
import { formatInstant, parseInstant, nowInstant } from './time.js';

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

  it('hashes bytes and strings consistently', () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]); // "abc"
    expect(sha256Hex(bytes)).toBe(sha256Hex('abc'));
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

describe('utf8Bytes and byteArrayCompare', () => {
  it('encodes and compares byte arrays', () => {
    const a = utf8Bytes('a');
    const b = utf8Bytes('b');
    expect(byteArrayCompare(a, b)).toBeLessThan(0);
    expect(byteArrayCompare(a, a)).toBe(0);
  });
});

describe('time helpers', () => {
  it('formats and parses instants', () => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    const formatted = formatInstant(date);
    expect(formatted).toBe('2020-01-01T00:00:00.000Z');
    const parsed = parseInstant(formatted);
    expect(parsed.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('produces RFC3339 instants', () => {
    const value = nowInstant();
    expect(() => new Date(value).toISOString()).not.toThrow();
  });
});
