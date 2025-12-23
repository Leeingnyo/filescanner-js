import { RootId, VPath } from './ids.js';

export enum LayerKind {
  OS = 'OS',
  ARCHIVE = 'ARCHIVE'
}

export interface VfsLayerOS {
  kind: LayerKind.OS;
  rootId: RootId;
}

export interface VfsLayerArchive {
  kind: LayerKind.ARCHIVE;
  format: string;
  containerVPath: VPath;
}

export type VfsLayer = VfsLayerOS | VfsLayerArchive;
