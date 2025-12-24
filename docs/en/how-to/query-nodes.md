# How-to: query nodes (filters, sorting, pagination)

All stores expose `queryNodes(snapshotId, query)`.

## Filter by prefix

```ts
const result = store.queryNodes(snapshotId, {
  filter: { vpathPrefix: '/photos' },
  sort: { key: 'VPATH', order: 'ASC' },
  page: { limit: 50 }
});
```

## Include deleted nodes (tombstones)

```ts
const result = store.queryNodes(snapshotId, {
  filter: { vpathPrefix: '/', includeDeleted: true }
});
```

## Pagination

The `nextCursor` returned by a query can be fed back into `page.cursor`:

```ts
const page1 = store.queryNodes(snapshotId, { page: { limit: 100 } });
const page2 = store.queryNodes(snapshotId, { page: { limit: 100, cursor: page1.nextCursor } });
```

