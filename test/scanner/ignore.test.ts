import { describe, expect, it } from 'vitest';
import { IgnoreMatcher } from '../../src/scanner/ignore/IgnoreMatcher.js';
import { CasePolicy } from '../../src/types/enums.js';

const rules = {
  glob: ['/foo/*.txt', '**/*.jpg', '/bar/**/baz?.png'],
  regex: ['^/regex/\\d+$']
};

describe('IgnoreMatcher', () => {
  it('matches anchored and unanchored globs', () => {
    const matcher = new IgnoreMatcher(rules, CasePolicy.SENSITIVE);
    expect(matcher.isIgnored('/foo/a.txt')).toBe(true);
    expect(matcher.isIgnored('/foo/a.jpg')).toBe(true);
    expect(matcher.isIgnored('/bar/x/bazy.png')).toBe(true);
    expect(matcher.isIgnored('/bar/x/bazzz.png')).toBe(false);
    expect(matcher.isIgnored('/other/a.txt')).toBe(false);
  });

  it('matches regex rules', () => {
    const matcher = new IgnoreMatcher(rules, CasePolicy.SENSITIVE);
    expect(matcher.isIgnored('/regex/123')).toBe(true);
    expect(matcher.isIgnored('/regex/abc')).toBe(false);
  });

  it('applies ASCII folding for insensitive policy', () => {
    const matcher = new IgnoreMatcher({ glob: ['/Foo/*.TXT'], regex: [] }, CasePolicy.INSENSITIVE);
    expect(matcher.isIgnored('/foo/a.txt')).toBe(true);
  });
});
