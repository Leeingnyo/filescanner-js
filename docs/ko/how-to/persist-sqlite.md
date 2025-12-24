# How-to: SQLite로 스냅샷 영속화하기

지속성 + 쿼리성이 필요하면 `SqliteSnapshotStore`를 사용합니다.

```ts
import { SqliteSnapshotStore } from 'filescanner';

const store = new SqliteSnapshotStore({ path: './filescanner.db' });
// 종료 시 store.close()
```

이후 사용법은 `SnapshotStore` 인터페이스(루트 등록, 스냅샷 생성, 패치, 쿼리 등)와 동일합니다.

