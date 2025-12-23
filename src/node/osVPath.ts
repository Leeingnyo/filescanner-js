import type { NodeRef } from '../types/noderef.js';
import type { VPath } from '../types/ids.js';
import { LayerKind } from '../types/layers.js';

export function osLayerVPath(ref: NodeRef): VPath {
  const archiveLayer = ref.layers.find((layer) => layer.kind === LayerKind.ARCHIVE) as
    | { containerVPath: VPath }
    | undefined;
  if (archiveLayer) {
    return archiveLayer.containerVPath;
  }
  return ref.vpath as VPath;
}
