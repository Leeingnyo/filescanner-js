import { describe, expect, it } from 'vitest';
import { mapFsError } from './errorMapper.js';
import { ErrorCode, ErrorStage } from '../types/enums.js';

describe('mapFsError', () => {
  it('maps permission errors', () => {
    const error = mapFsError({ code: 'EACCES', message: 'no' }, ErrorStage.READ);
    expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(error.retryable).toBe(false);
    expect(error.osCode).toBe('EACCES');
  });

  it('maps not found and path too long', () => {
    const missing = mapFsError({ code: 'ENOENT', message: 'missing' }, ErrorStage.STAT);
    expect(missing.code).toBe(ErrorCode.NOT_FOUND);
    const long = mapFsError({ code: 'ENAMETOOLONG', message: 'long' }, ErrorStage.OPEN);
    expect(long.code).toBe(ErrorCode.PATH_TOO_LONG);
  });

  it('maps unknown codes to IO_ERROR', () => {
    const err = mapFsError({ code: 'EIO', message: 'io' }, ErrorStage.LIST);
    expect(err.code).toBe(ErrorCode.IO_ERROR);
    expect(err.retryable).toBe(true);
  });
});

