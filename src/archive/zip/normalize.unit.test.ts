import { describe, expect, it } from 'vitest';
import { decodeZipFileName, normalizeZipPath, ZipEntryError } from './normalize.js';
import { ErrorCode } from '../../types/enums.js';


describe('zip entry normalization', () => {
  it('decodes UTF-8 names', () => {
    const name = decodeZipFileName(Buffer.from('café', 'utf8'), true);
    expect(name).toBe('café');
  });

  it('decodes CP437 names', () => {
    const name = decodeZipFileName(Buffer.from([0x82]), false); // CP437 é
    expect(name).toBe('é');
  });

  it('normalizes paths and rejects traversal', () => {
    expect(normalizeZipPath('dir\\file.txt')).toBe('/dir/file.txt');
    expect(normalizeZipPath('./dir/file.txt')).toBe('/dir/file.txt');
    expect(() => normalizeZipPath('../evil.txt')).toThrow(ZipEntryError);
    try {
      normalizeZipPath('../evil.txt');
    } catch (err) {
      expect((err as ZipEntryError).code).toBe(ErrorCode.INVALID_VPATH_PARENT_SEGMENT);
    }
  });

  it('rejects absolute and empty segments', () => {
    expect(() => normalizeZipPath('/abs.txt')).toThrow(ZipEntryError);
    expect(() => normalizeZipPath('a//b')).toThrow(ZipEntryError);
  });
});
