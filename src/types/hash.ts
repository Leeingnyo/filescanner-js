import { HashStatus } from './enums.js';
import type { NodeError } from './error.js';

export interface HashValue {
  algo: string;
  value?: string;
  status: HashStatus;
  error?: NodeError;
}

export type HashMap = Record<string, HashValue>;
