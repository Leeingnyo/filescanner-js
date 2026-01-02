import { describe, expect, it } from 'vitest';
import { osLayerVPath } from './osVPath.js';
import { LayerKind } from '../types/layers.js';

describe('osLayerVPath', () => {
  it('returns archive container vpath when archive layer exists', () => {
    const ref = {
      rootId: 'r:1',
      layers: [
        { kind: LayerKind.OS, rootId: 'r:1' },
        { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/archive.zip' }
      ],
      vpath: '/inner.txt'
    };
    expect(osLayerVPath(ref as any)).toBe('/archive.zip');
  });

  it('returns ref vpath when no archive layer', () => {
    const ref = { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/file.txt' };
    expect(osLayerVPath(ref as any)).toBe('/file.txt');
  });
});
