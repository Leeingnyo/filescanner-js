import type { NodeRef } from '../types/noderef.js';
import type { VPath } from '../types/ids.js';
import { CasePolicy } from '../types/enums.js';
import { layersSigHash } from './layersSig.js';
import { vpathKey } from '../vpath/key.js';

export function nodeRefKey(ref: NodeRef, casePolicy: CasePolicy): string {
  const vkey = vpathKey(ref.vpath as VPath, casePolicy);
  return `${ref.rootId}:${layersSigHash(ref.layers)}:${vkey}`;
}
