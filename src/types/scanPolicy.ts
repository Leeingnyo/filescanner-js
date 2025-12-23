
export enum ErrorPolicy {
  FAIL_FAST = 'FAIL_FAST',
  CONTINUE_AND_REPORT = 'CONTINUE_AND_REPORT',
  SKIP_SUBTREE = 'SKIP_SUBTREE'
}

export enum SymlinkPolicy {
  DONT_FOLLOW = 'DONT_FOLLOW',
  FOLLOW_SAFE = 'FOLLOW_SAFE',
  FOLLOW_ALL = 'FOLLOW_ALL'
}

export interface ArchivePolicy {
  includeArchives: boolean;
  formats: string[];
  maxNesting: number;
  onEncrypted: ErrorPolicy;
}

export interface IgnoreRules {
  glob: string[];
  regex: string[];
}

export interface ScanPolicy {
  errorPolicy: ErrorPolicy;
  symlinkPolicy: SymlinkPolicy;
  archivePolicy: ArchivePolicy;
}

export interface Concurrency {
  io: number;
  cpu: number;
}
