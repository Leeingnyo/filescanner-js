import { ErrorCode, ErrorStage } from '../types/enums.js';
import type { NodeError } from '../types/error.js';
import { nowInstant } from '../utils/time.js';

const PERMISSION_CODES = new Set(['EACCES', 'EPERM']);

export function mapFsError(err: unknown, stage: ErrorStage): NodeError {
  const error = err as { code?: string; message?: string };
  const code = error.code;
  let mapped: ErrorCode = ErrorCode.UNKNOWN;
  if (code) {
    if (PERMISSION_CODES.has(code)) mapped = ErrorCode.PERMISSION_DENIED;
    else if (code === 'ENOENT') mapped = ErrorCode.NOT_FOUND;
    else if (code === 'ENAMETOOLONG') mapped = ErrorCode.PATH_TOO_LONG;
    else mapped = ErrorCode.IO_ERROR;
  }
  return {
    code: mapped,
    stage,
    message: error.message ?? String(err),
    retryable: mapped === ErrorCode.IO_ERROR,
    osCode: code,
    at: nowInstant()
  };
}
