import { describe, expect, it } from 'vitest';
import { CoverageTracker } from './coverageTracker.js';
import { ScopeCompleteness, ScopeMode } from '../types/scan.js';
import { ErrorCode, ErrorStage } from '../types/enums.js';

describe('CoverageTracker', () => {
  it('marks partial scopes and stores representative errors', () => {
    const tracker = new CoverageTracker('run:1', [
      { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      { baseVPath: '/a', mode: ScopeMode.CHILDREN_ONLY }
    ]);

    tracker.recordError(0, {
      code: ErrorCode.IO_ERROR,
      stage: ErrorStage.LIST,
      message: 'io',
      retryable: true,
      at: new Date(1_700_000_000_000).toISOString()
    });

    const coverage = tracker.finalize();
    expect(coverage.scopes[0].completeness).toBe(ScopeCompleteness.PARTIAL);
    expect(coverage.scopes[0].errors?.[0].code).toBe(ErrorCode.IO_ERROR);
    expect(coverage.scopes[1].completeness).toBe(ScopeCompleteness.COMPLETE);
  });

  it('ignores NOT_FOUND for completeness', () => {
    const tracker = new CoverageTracker('run:2', [{ baseVPath: '/', mode: ScopeMode.FULL_SUBTREE }]);
    tracker.recordError(0, {
      code: ErrorCode.NOT_FOUND,
      stage: ErrorStage.STAT,
      message: 'missing',
      retryable: false,
      at: new Date(1_700_000_000_000).toISOString()
    });
    const coverage = tracker.finalize();
    expect(coverage.scopes[0].completeness).toBe(ScopeCompleteness.COMPLETE);
    expect(coverage.scopes[0].errors).toBeUndefined();
  });

  it('marks remaining scopes partial when canceled', () => {
    const tracker = new CoverageTracker('run:3', [
      { baseVPath: '/', mode: ScopeMode.FULL_SUBTREE },
      { baseVPath: '/a', mode: ScopeMode.FULL_SUBTREE },
      { baseVPath: '/b', mode: ScopeMode.FULL_SUBTREE }
    ]);
    tracker.markRemainingPartial(1);
    const coverage = tracker.finalize();
    expect(coverage.scopes[0].completeness).toBe(ScopeCompleteness.COMPLETE);
    expect(coverage.scopes[1].completeness).toBe(ScopeCompleteness.PARTIAL);
    expect(coverage.scopes[2].completeness).toBe(ScopeCompleteness.PARTIAL);
  });
});

