import { describe, expect, it } from 'vitest';
import { layersSigJson, layersSigHash } from './layersSig.js';
import { LayerKind } from '../types/layers.js';

describe('layersSig', () => {
  it('serializes canonical json', () => {
    const layers = [
      { kind: LayerKind.OS, rootId: 'r:1f2c' },
      { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/A.zip' }
    ];
    const json = layersSigJson(layers);
    expect(json).toBe('[{"kind":"OS","rootId":"r:1f2c"},{"containerVPath":"/A.zip","format":"zip","kind":"ARCHIVE"}]');
  });

  it('hashes deterministically', () => {
    const layers = [{ kind: LayerKind.OS, rootId: 'r:1f2c' }];
    const hash = layersSigHash(layers);
    expect(hash).toHaveLength(64);
  });
});
