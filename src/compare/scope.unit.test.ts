import { describe, expect, it } from 'vitest';
import { isScopeCovered } from './scope.js';
import { ScopeCompleteness, ScopeMode, type CoverageScope } from '../types/scan.js';

function cover(scope: { baseVPath: string; mode: ScopeMode }): CoverageScope {
  return { scope, completeness: ScopeCompleteness.COMPLETE };
}

describe('isScopeCovered', () => {
  it('handles FULL_SUBTREE coverage', () => {
    const coverage = [cover({ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE })];
    expect(isScopeCovered(coverage, { baseVPath: '/a', mode: ScopeMode.SINGLE_NODE })).toBe(true);
  });

  it('handles CHILDREN_ONLY coverage', () => {
    const coverage = [cover({ baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY })];
    expect(isScopeCovered(coverage, { baseVPath: '/a/b', mode: ScopeMode.SINGLE_NODE })).toBe(true);
    expect(isScopeCovered(coverage, { baseVPath: '/a/b/c', mode: ScopeMode.SINGLE_NODE })).toBe(false);
    expect(isScopeCovered(coverage, { baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY })).toBe(true);
  });

  it('handles SINGLE_NODE coverage', () => {
    const coverage = [cover({ baseVPath: '/a', mode: ScopeMode.SINGLE_NODE })];
    expect(isScopeCovered(coverage, { baseVPath: '/a', mode: ScopeMode.SINGLE_NODE })).toBe(true);
    expect(isScopeCovered(coverage, { baseVPath: '/a/b', mode: ScopeMode.SINGLE_NODE })).toBe(false);
  });

  it('does not treat children-only coverage as full subtree', () => {
    const coverage = [cover({ baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY })];
    expect(isScopeCovered(coverage, { baseVPath: '/a', mode: ScopeMode.FULL_SUBTREE })).toBe(false);
    expect(isScopeCovered(coverage, { baseVPath: '/b', mode: ScopeMode.SINGLE_NODE })).toBe(false);
  });
});
