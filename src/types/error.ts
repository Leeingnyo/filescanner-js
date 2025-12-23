import type { Instant } from './ids.js';
import { ErrorCode, ErrorStage } from './enums.js';

export interface NodeError {
  code: ErrorCode;
  stage: ErrorStage;
  message: string;
  retryable: boolean;
  osCode?: string;
  at: Instant;
}
