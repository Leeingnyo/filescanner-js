import type { Coverage, CoverageScope, ScanScope } from '../types/scan.js';
import { ScopeCompleteness } from '../types/scan.js';
import type { NodeError } from '../types/error.js';
import { ErrorCode } from '../types/enums.js';

const MAX_ERRORS = 10;

export class CoverageTracker {
  private readonly scopes: CoverageScope[];
  private readonly errors: NodeError[][];

  constructor(private readonly runId: string, scopes: ScanScope[]) {
    this.scopes = scopes.map((scope) => ({ scope, completeness: ScopeCompleteness.COMPLETE }));
    this.errors = scopes.map(() => []);
  }

  markPartial(scopeIndex: number, error?: NodeError): void {
    if (!this.scopes[scopeIndex]) return;
    if (this.scopes[scopeIndex].completeness !== ScopeCompleteness.PARTIAL) {
      this.scopes[scopeIndex].completeness = ScopeCompleteness.PARTIAL;
    }
    if (error && error.code !== ErrorCode.NOT_FOUND && this.errors[scopeIndex].length < MAX_ERRORS) {
      this.errors[scopeIndex].push(error);
    }
  }

  recordError(scopeIndex: number | null, error: NodeError): void {
    if (scopeIndex === null) return;
    if (error.code === ErrorCode.NOT_FOUND) return;
    this.markPartial(scopeIndex, error);
  }

  markRemainingPartial(startIndex: number): void {
    for (let i = startIndex; i < this.scopes.length; i += 1) {
      this.markPartial(i);
    }
  }

  finalize(): Coverage {
    const scopes = this.scopes.map((scope, index) => {
      const errors = this.errors[index];
      if (errors.length > 0) {
        return { ...scope, errors };
      }
      return scope;
    });
    return { runId: this.runId, scopes };
  }
}

