import type { ObservedNode } from '../../types/observedNode.js';
import type { NodeMeta } from '../../types/nodeMeta.js';
import type { VPath } from '../../types/ids.js';
import { CasePolicy, HashStatus } from '../../types/enums.js';
import { layersSigHash } from '../../node/layersSig.js';
import { vpathFold } from '../../vpath/fold.js';
import { vpathKey as vpathKeyFn } from '../../vpath/key.js';
import { parentKeyOf } from '../../node/parentKey.js';
import { nameKey } from '../../node/nameKey.js';
import { identityValue } from '../../node/identityKey.js';
import { osLayerVPath } from '../../node/osVPath.js';
import { toCanonicalString } from '../../node/canonical.js';

export interface DerivedNodeFields {
  layersJson: string;
  layersSigHash: string;
  vpathFold: VPath;
  vpathKey: VPath;
  parentKey: string;
  nameKey: string;
  identityValue?: string;
  canonical: string;
  osVpath: VPath;
  osVpathKey: VPath;
  hashKeys: string[];
}

export function deriveObservedNodeFields(node: ObservedNode, casePolicy: CasePolicy): DerivedNodeFields {
  const vfold = vpathFold(node.ref.vpath as VPath);
  const vkey = vpathKeyFn(node.ref.vpath as VPath, casePolicy);
  const osVpath = osLayerVPath(node.ref);
  return {
    layersJson: JSON.stringify(node.ref.layers),
    layersSigHash: layersSigHash(node.ref.layers),
    vpathFold: vfold,
    vpathKey: vkey,
    parentKey: parentKeyOf(node.ref),
    nameKey: nameKey(node.name, casePolicy),
    identityValue: identityValue(node.identity) ?? undefined,
    canonical: toCanonicalString(node.ref),
    osVpath,
    osVpathKey: vpathKeyFn(osVpath as VPath, casePolicy),
    hashKeys: Object.values(node.hashes)
      .filter((hash) => hash.status === HashStatus.PRESENT && hash.value)
      .map((hash) => `${hash.algo}:${hash.value}`)
  };
}

export function deriveMetaFields(meta: NodeMeta, casePolicy: CasePolicy): DerivedNodeFields {
  return deriveObservedNodeFields(meta as unknown as ObservedNode, casePolicy);
}
