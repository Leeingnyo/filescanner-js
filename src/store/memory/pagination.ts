import type { Page } from '../../types/store/query.js';

export function applyPagination<T>(items: T[], page?: Page): { items: T[]; nextCursor?: string } {
  if (!page) {
    return { items };
  }
  const limit = page.limit;
  const cursor = page.cursor ?? '0';
  const offset = Number.parseInt(cursor, 10);
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error('Invalid cursor');
  }
  const sliced = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextCursor = nextOffset < items.length ? String(nextOffset) : undefined;
  return { items: sliced, nextCursor };
}
