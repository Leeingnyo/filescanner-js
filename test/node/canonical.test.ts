import { describe, expect, it } from 'vitest';
import { toCanonicalString, parseCanonicalString } from '../../src/node/canonical.js';
import { LayerKind } from '../../src/types/layers.js';

describe('canonical string', () => {
  it('serializes OS refs', () => {
    const ref = { rootId: 'r:1', layers: [{ kind: LayerKind.OS, rootId: 'r:1' }], vpath: '/photos/a.jpg' };
    expect(toCanonicalString(ref)).toBe('root:r:1:/photos/a.jpg');
  });

  it('serializes archive refs', () => {
    const ref = {
      rootId: 'r:1',
      layers: [
        { kind: LayerKind.OS, rootId: 'r:1' },
        { kind: LayerKind.ARCHIVE, format: 'zip', containerVPath: '/A.zip' }
      ],
      vpath: '/001.png'
    };
    expect(toCanonicalString(ref)).toBe('root:r:1:/A.zip!/001.png');
  });

  it('parses archive refs', () => {
    const parsed = parseCanonicalString('root:r:1:/A.zip!/001.png');
    expect(parsed.rootId).toBe('r:1');
    expect(parsed.layers.length).toBe(2);
    expect(parsed.layers[1].kind).toBe(LayerKind.ARCHIVE);
    expect((parsed.layers[1] as { containerVPath: string }).containerVPath).toBe('/A.zip');
    expect(parsed.vpath).toBe('/001.png');
  });
});
