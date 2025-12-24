# How-to: resolve a node at access time (existence check)

Use `VfsResolver` to validate existence at the moment you need it.

```ts
import { DefaultVfs, VfsResolver, ArchiveRegistry, ZipArchiveReader } from 'filescanner';

const vfs = new DefaultVfs(rootsResolver, new ArchiveRegistry([new ZipArchiveReader()]));
const resolver = new VfsResolver(vfs);

const res = await resolver.statNow(ref);
if (!res.exists) {
  console.log('missing', res.error);
} else {
  console.log('exists', res.meta);
}
```

