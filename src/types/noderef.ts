import { RootId, VPath } from './ids.js';
import { VfsLayer } from './layers.js';

export interface NodeRef {
  rootId: RootId;
  layers: VfsLayer[];
  vpath: VPath;
}
