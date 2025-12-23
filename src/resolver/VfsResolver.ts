import type { Resolver, ResolveResult } from './types.js';
import type { NodeRef } from '../types/noderef.js';
import type { Vfs } from '../vfs/Vfs.js';
import { ErrorStage } from '../types/enums.js';
import { mapFsError } from '../scanner/errorMapper.js';

export class VfsResolver implements Resolver {
  constructor(private readonly vfs: Vfs) {}

  async statNow(ref: NodeRef): Promise<ResolveResult> {
    try {
      const meta = await this.vfs.stat(ref);
      return { exists: true, meta };
    } catch (err) {
      const error = mapFsError(err, ErrorStage.STAT);
      return { exists: false, error };
    }
  }
}
