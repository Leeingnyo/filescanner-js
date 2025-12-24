# How-to: persist snapshots in SQLite

Use `SqliteSnapshotStore` when you need persistence and queryability.

```ts
import { SqliteSnapshotStore } from 'filescanner';

const store = new SqliteSnapshotStore({ path: './filescanner.db' });
// store.close() when done
```

Everything else (register root, create snapshot, begin patch, queries) uses the same `SnapshotStore` interface.

## Notes

- Cursors in the SQLite store are simple numeric offsets encoded as strings.
- The SQLite schema is created automatically on construction.

