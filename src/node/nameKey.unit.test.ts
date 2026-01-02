import { describe, expect, it } from 'vitest';
import { nameKey } from './nameKey.js';
import { CasePolicy } from '../types/enums.js';

describe('nameKey', () => {
  it('folds ASCII names when insensitive', () => {
    expect(nameKey('AbC', CasePolicy.INSENSITIVE)).toBe('abc');
  });

  it('keeps names when sensitive', () => {
    expect(nameKey('AbC', CasePolicy.SENSITIVE)).toBe('AbC');
  });
});
