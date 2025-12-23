import type { NodeRef } from '../types/noderef.js';
import type { NodeMeta } from '../types/nodeMeta.js';

export interface Vfs {
  listChildren(ref: NodeRef): Promise<NodeRef[]>;
  stat(ref: NodeRef): Promise<NodeMeta>;
  openRead(ref: NodeRef): Promise<NodeJS.ReadableStream>;
  openReadRange?(ref: NodeRef, offset: number, length: number): Promise<NodeJS.ReadableStream>;
}
