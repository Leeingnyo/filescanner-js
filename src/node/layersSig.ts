import type { VfsLayer } from '../types/layers.js';
import { LayerKind } from '../types/layers.js';
import { sha256HexUtf8 } from '../utils/crypto.js';

function jsonValue(value: string): string {
  return JSON.stringify(value);
}

function layerJson(layer: VfsLayer): string {
  if (layer.kind === LayerKind.OS) {
    return `{"kind":${jsonValue(layer.kind)},"rootId":${jsonValue(layer.rootId)}}`;
  }
  return `{"containerVPath":${jsonValue(layer.containerVPath)},"format":${jsonValue(layer.format)},"kind":${jsonValue(layer.kind)}}`;
}

export function layersSigJson(layers: VfsLayer[]): string {
  return `[${layers.map(layerJson).join(',')}]`;
}

export function layersSigHash(layers: VfsLayer[]): string {
  return sha256HexUtf8(layersSigJson(layers));
}
