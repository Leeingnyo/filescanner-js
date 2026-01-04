import { ErrorPolicy, SymlinkPolicy } from '../../dist/types/scanPolicy.js';

export function makePolicy(includeArchives) {
  return {
    errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
    symlinkPolicy: SymlinkPolicy.DONT_FOLLOW,
    archivePolicy: {
      includeArchives,
      formats: ['zip'],
      maxNesting: 1,
      onEncrypted: ErrorPolicy.SKIP_SUBTREE
    }
  };
}

export const defaultIgnore = { glob: [], regex: [] };
export const defaultConcurrency = { io: 1, cpu: 1 };
