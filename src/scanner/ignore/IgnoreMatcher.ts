import RE2 from 're2';
import { CasePolicy } from '../../types/enums.js';
import type { IgnoreRules } from '../../types/scanPolicy.js';
import type { VPath } from '../../types/ids.js';
import { vpathFold } from '../../vpath/fold.js';
import { globToRegExp } from './glob.js';
import { asciiFold } from '../../utils/asciiFold.js';

export class IgnoreMatcher {
  private readonly globMatchers: RegExp[];
  private readonly regexMatchers: RE2[];
  private readonly casePolicy: CasePolicy;

  constructor(rules: IgnoreRules, casePolicy: CasePolicy) {
    this.casePolicy = casePolicy;
    this.globMatchers = (rules.glob ?? []).map((pattern) => {
      const effective = casePolicy === CasePolicy.INSENSITIVE ? asciiFold(pattern) : pattern;
      const anchored = pattern.startsWith('/');
      const normalized = anchored ? effective : effective;
      return globToRegExp(normalized, anchored);
    });
    this.regexMatchers = (rules.regex ?? []).map((pattern) => new RE2(pattern));
  }

  isIgnored(vpath: VPath): boolean {
    const target = this.casePolicy === CasePolicy.INSENSITIVE ? vpathFold(vpath) : vpath;
    for (const matcher of this.globMatchers) {
      if (matcher.test(target)) return true;
    }
    for (const matcher of this.regexMatchers) {
      if (matcher.test(target)) return true;
    }
    return false;
  }
}
