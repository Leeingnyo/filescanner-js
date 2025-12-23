import type { FileIdentity } from '../types/identity.js';
import type { NodeRef } from '../types/noderef.js';
import type { VPath } from '../types/ids.js';
import { CasePolicy } from '../types/enums.js';
import { identityValue } from './identityKey.js';
import { layersSigHash } from './layersSig.js';
import { vpathKey as vpathKeyFn } from '../vpath/key.js';

export function deriveEntityKey(identity: FileIdentity, ref: NodeRef, casePolicy: CasePolicy): string {
  const idValue = identityValue(identity);
  if (idValue) {
    return idValue;
  }
  const vpathKey = vpathKeyFn(ref.vpath as VPath, casePolicy);
  const layersHash = layersSigHash(ref.layers);
  return `path:${ref.rootId}:${layersHash}:${vpathKey}`;
}
