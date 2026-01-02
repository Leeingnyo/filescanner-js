import { describe, expect, it } from 'vitest';
import { resolveCasePolicy } from './casePolicy.js';
import { CasePolicy } from '../types/enums.js';
import { vpathKey } from '../vpath/key.js';

describe('resolveCasePolicy', () => {
  it('resolves AUTO via capabilities', () => {
    expect(resolveCasePolicy(CasePolicy.AUTO, { caseSensitive: true, supportsFileId: false })).toBe(CasePolicy.SENSITIVE);
    expect(resolveCasePolicy(CasePolicy.AUTO, { caseSensitive: false, supportsFileId: false })).toBe(CasePolicy.INSENSITIVE);
  });

  it('applies ASCII-only folding for insensitive vpathKey', () => {
    const resolved = resolveCasePolicy(CasePolicy.AUTO, { caseSensitive: false, supportsFileId: false });
    const key = vpathKey('/A/%C3%89', resolved);
    expect(key).toBe('/a/%C3%89');
  });
});

