import { CasePolicy } from '../types/enums.js';
import type { RootCapabilities } from '../types/root.js';

export function resolveCasePolicy(casePolicy: CasePolicy, capabilities: RootCapabilities): CasePolicy {
  if (casePolicy !== CasePolicy.AUTO) return casePolicy;
  return capabilities.caseSensitive ? CasePolicy.SENSITIVE : CasePolicy.INSENSITIVE;
}
