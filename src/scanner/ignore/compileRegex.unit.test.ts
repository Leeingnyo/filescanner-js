import { describe, expect, it } from 'vitest';
import { compileRegex } from './compileRegex.js';

describe('compileRegex', () => {
  it('creates a usable regex when RE2 is unavailable', () => {
    const re = compileRegex('^/foo/\\d+$');
    expect(re.test('/foo/123')).toBe(true);
    expect(re.test('/foo/bar')).toBe(false);
  });
});
