import type { Instant, OsPath, RootId, RootKey } from './ids.js';
import { CasePolicy, OsKind } from './enums.js';

export interface RootCapabilities {
  caseSensitive: boolean;
  supportsFileId: boolean;
}

export interface RootDescriptor {
  rootId: RootId;
  rootKey: RootKey;
  os: OsKind;
  osPath: OsPath;
  createdAt: Instant;
  casePolicy: CasePolicy;
  capabilities: RootCapabilities;
}
