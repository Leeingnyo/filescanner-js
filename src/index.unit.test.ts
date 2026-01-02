import { describe, expect, it } from 'vitest';
import * as api from './index.js';

describe('public exports', () => {
  it('exposes core classes', () => {
    expect(api.MemorySnapshotStore).toBeDefined();
    expect(api.SqliteSnapshotStore).toBeDefined();
    expect(api.FileSystemScanner).toBeDefined();
    expect(api.DefaultComparer).toBeDefined();
    expect(api.DefaultAligner).toBeDefined();
    expect(api.FileExecutor).toBeDefined();
    expect(api.ArchiveRegistry).toBeDefined();
    expect(api.ZipArchiveReader).toBeDefined();
    expect(api.DefaultVfs).toBeDefined();
    expect(api.VfsResolver).toBeDefined();
  });
});

