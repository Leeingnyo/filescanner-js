import { IdentityPlatform } from './enums.js';

export interface WindowsFileId {
  volumeId: string;
  fileId: string;
}

export interface PosixFileId {
  dev: number;
  inode: number;
}

export interface FileIdentity {
  platform: IdentityPlatform;
  windows?: WindowsFileId;
  posix?: PosixFileId;
  isAvailable: boolean;
}
