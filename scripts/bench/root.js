import { normalizeRootKey } from '../../dist/root/normalizeRootKey.js';
import { CasePolicy, OsKind } from '../../dist/types/enums.js';

export function makeRoot(rootId, osPath) {
  const osKind = process.platform === 'win32' ? OsKind.WINDOWS : OsKind.POSIX;
  return {
    rootId,
    rootKey: normalizeRootKey(osPath, osKind),
    os: osKind,
    osPath,
    createdAt: new Date().toISOString(),
    casePolicy: CasePolicy.AUTO,
    capabilities: { caseSensitive: process.platform !== 'win32', supportsFileId: false }
  };
}

export function createRootResolver(root) {
  return {
    getRoot: () => root
  };
}
