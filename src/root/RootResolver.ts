import type { RootDescriptor } from '../types/root.js';
import type { RootId } from '../types/ids.js';

export interface RootResolver {
  getRoot(rootId: RootId): RootDescriptor;
}
