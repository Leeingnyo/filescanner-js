# How-to: ZIP 아카이브를 디렉터리처럼 스캔하기

아카이브 스캔을 켜려면:

1) `ArchiveRegistry`에 reader 등록(예: `ZipArchiveReader`)
2) `policy.archivePolicy.includeArchives=true`
3) formats / nesting 지정

```ts
import { ArchiveRegistry, ZipArchiveReader, ErrorPolicy } from 'filescanner';

const archives = new ArchiveRegistry([new ZipArchiveReader()]);

const policy = {
  errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
  symlinkPolicy: 'FOLLOW_SAFE',
  archivePolicy: { includeArchives: true, formats: ['zip'], maxNesting: 2, onEncrypted: ErrorPolicy.SKIP_SUBTREE }
};
```

## 무엇이 emit 되나?

- 아카이브 파일 자체(OS-layer `FILE`)
- archive-layer 루트 디렉터리(`vpath="/"`, `ARCHIVE` layer 추가)
- 엔트리(정규화된 VPath로 하위에 배치)

개념 설명: `docs/ko/explanations/archives-as-layers.md`

