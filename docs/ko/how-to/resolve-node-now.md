# How-to: 접근 시점에 존재 여부 확인하기 (Resolver)

`VfsResolver`를 사용하면 지금 이 순간 존재하는지(stat) 확인할 수 있습니다.

```ts
import { DefaultVfs, VfsResolver, ArchiveRegistry, ZipArchiveReader } from 'filescanner';

const vfs = new DefaultVfs(rootsResolver, new ArchiveRegistry([new ZipArchiveReader()]));
const resolver = new VfsResolver(vfs);

const res = await resolver.statNow(ref);
if (!res.exists) console.log('missing', res.error);
else console.log('exists', res.meta);
```

