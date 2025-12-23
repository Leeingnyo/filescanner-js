import { asciiFold } from '../utils/asciiFold.js';
import { CasePolicy } from '../types/enums.js';

export function nameKey(name: string, casePolicy: CasePolicy): string {
  if (casePolicy === CasePolicy.INSENSITIVE) {
    return asciiFold(name);
  }
  return name;
}
