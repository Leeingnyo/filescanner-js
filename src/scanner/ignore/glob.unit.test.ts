import { describe, expect, it } from 'vitest';
import { globToRegExp } from './glob.js';

describe('globToRegExp', () => {
  it('matches anchored patterns under exact prefixes', () => {
    const re = globToRegExp('/foo/*.txt', true);
    expect(re.test('/foo/a.txt')).toBe(true);
    expect(re.test('/foo/a/b.txt')).toBe(false);
    expect(re.test('/bar/a.txt')).toBe(false);
  });

  it('matches unanchored patterns anywhere in the path', () => {
    const re = globToRegExp('foo/*.txt', false);
    expect(re.test('/foo/a.txt')).toBe(true);
    expect(re.test('/bar/foo/a.txt')).toBe(true);
  });

  it('supports globstar and trailing subtree match', () => {
    const re = globToRegExp('/foo/**', true);
    expect(re.test('/foo')).toBe(true);
    expect(re.test('/foo/bar/baz.txt')).toBe(true);
  });

  it('supports single-character and character class matches', () => {
    const single = globToRegExp('/foo/??.txt', true);
    expect(single.test('/foo/ab.txt')).toBe(true);
    expect(single.test('/foo/abc.txt')).toBe(false);

    const klass = globToRegExp('/foo/[ab].txt', true);
    expect(klass.test('/foo/a.txt')).toBe(true);
    expect(klass.test('/foo/c.txt')).toBe(false);
  });
});
