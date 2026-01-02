import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { vpathToOsPath } from './osPath.js';
import { OsKind, CasePolicy } from '../types/enums.js';

describe('vpathToOsPath', () => {
  it('joins decoded segments on POSIX', () => {
    const root = {
      rootId: 'r:1',
      rootKey: 'posixpath:/tmp/root',
      os: OsKind.POSIX,
      osPath: '/tmp/root',
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: true, supportsFileId: false }
    };
    const osPath = vpathToOsPath(root, '/a%20b/c' as any);
    expect(osPath).toBe(path.posix.join('/tmp/root', 'a b', 'c'));
  });

  it('joins decoded segments on Windows', () => {
    const root = {
      rootId: 'r:2',
      rootKey: 'winpath:C:\\Root',
      os: OsKind.WINDOWS,
      osPath: 'C:\\Root',
      createdAt: new Date().toISOString(),
      casePolicy: CasePolicy.AUTO,
      capabilities: { caseSensitive: false, supportsFileId: false }
    };
    const osPath = vpathToOsPath(root, '/dir/file.txt' as any);
    expect(osPath).toBe(path.win32.join('C:\\Root', 'dir', 'file.txt'));
  });
});
