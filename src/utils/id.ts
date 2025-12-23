import { randomUUID } from 'node:crypto';

export function createId(prefix: string): string {
  return `${prefix}${randomUUID()}`;
}

export function createIncrementalId(prefix: string, value: number, width = 12): string {
  const padded = value.toString().padStart(width, '0');
  return `${prefix}${padded}`;
}
