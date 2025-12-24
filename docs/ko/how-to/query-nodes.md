# How-to: 노드 쿼리하기 (필터/정렬/페이지네이션)

모든 스토어는 `queryNodes(snapshotId, query)`를 제공합니다.

## prefix 필터

```ts
const result = store.queryNodes(snapshotId, {
  filter: { vpathPrefix: '/photos' },
  sort: { key: 'VPATH', order: 'ASC' },
  page: { limit: 50 }
});
```

## 삭제 노드(tombstone) 포함

```ts
const result = store.queryNodes(snapshotId, {
  filter: { vpathPrefix: '/', includeDeleted: true }
});
```

## 페이지네이션

```ts
const page1 = store.queryNodes(snapshotId, { page: { limit: 100 } });
const page2 = store.queryNodes(snapshotId, { page: { limit: 100, cursor: page1.nextCursor } });
```

