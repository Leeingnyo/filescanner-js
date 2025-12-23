import { createHash } from 'node:crypto';

export function sha256HexBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Hex(value: Uint8Array | string): string {
  if (typeof value === 'string') {
    return sha256HexUtf8(value);
  }
  return sha256HexBytes(value);
}
