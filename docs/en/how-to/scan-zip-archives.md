# How-to: include ZIP archives in scans

To scan archives as directories:

1) Provide an `ArchiveRegistry` with a reader (e.g. `ZipArchiveReader`)
2) Set `policy.archivePolicy.includeArchives=true`
3) Include formats and nesting

```ts
import { ArchiveRegistry, ZipArchiveReader, ErrorPolicy } from 'filescanner';

const archives = new ArchiveRegistry([new ZipArchiveReader()]);

const policy = {
  errorPolicy: ErrorPolicy.CONTINUE_AND_REPORT,
  symlinkPolicy: 'FOLLOW_SAFE',
  archivePolicy: {
    includeArchives: true,
    formats: ['zip'],
    maxNesting: 2,
    onEncrypted: ErrorPolicy.SKIP_SUBTREE
  }
};
```

## What gets emitted

When enabled, the scanner emits:

- The archive file itself as an OS-layer `FILE`
- An archive-layer root directory at `vpath="/"` with an added `ARCHIVE` layer
- Archive entries under that layer using normalized entry VPaths

See `docs/en/explanations/archives-as-layers.md`.

