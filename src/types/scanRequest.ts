import type { SnapshotId, RootId } from './ids.js';
import type { ScanScope } from './scan.js';
import type { ScanPolicy, IgnoreRules, Concurrency } from './scanPolicy.js';

export interface ScanRequest {
  snapshotId: SnapshotId;
  rootId: RootId;
  scopes: ScanScope[];
  policy: ScanPolicy;
  ignore: IgnoreRules;
  concurrency: Concurrency;
}
