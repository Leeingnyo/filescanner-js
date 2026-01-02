import type { CoverageScope, ScanScope } from '../types/scan.js';
import { ScopeCompleteness, ScopeMode } from '../types/scan.js';
import { vpathHasPrefix } from '../vpath/prefix.js';
import { isImmediateChild } from '../vpath/normalize.js';

export function isScopeCovered(coverage: CoverageScope[], target: ScanScope): boolean {
  return coverage.some((scope) => scope.completeness === ScopeCompleteness.COMPLETE && coversScope(scope.scope, target));
}

export function coversScope(cover: ScanScope, target: ScanScope): boolean {
  if (cover.mode === ScopeMode.FULL_SUBTREE) {
    return vpathHasPrefix(target.baseVPath, cover.baseVPath);
  }
  if (cover.mode === ScopeMode.CHILDREN_ONLY) {
    if (target.mode === ScopeMode.CHILDREN_ONLY && target.baseVPath === cover.baseVPath) {
      return true;
    }
    if (target.mode === ScopeMode.SINGLE_NODE) {
      return isImmediateChild(cover.baseVPath, target.baseVPath);
    }
    return false;
  }
  if (cover.mode === ScopeMode.SINGLE_NODE) {
    return target.mode === ScopeMode.SINGLE_NODE && target.baseVPath === cover.baseVPath;
  }
  return false;
}
