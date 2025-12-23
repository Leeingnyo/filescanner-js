import type { VPath } from '../types/ids.js';
import { CasePolicy } from '../types/enums.js';
import { vpathFold } from './fold.js';

export function vpathKey(vpath: VPath, casePolicy: CasePolicy): VPath {
  if (casePolicy === CasePolicy.INSENSITIVE) {
    return vpathFold(vpath);
  }
  return vpath;
}
