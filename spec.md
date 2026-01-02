# File Scanner Core Module — Specification (Final v5)

**Status**: Normative

**Purpose**: Define a language‑agnostic core library that scans OS directories and (optionally) archive contents into a **virtual tree**, persists results as **snapshots**, supports **incremental patching**, provides deterministic **2‑way diff** and **multi‑snapshot alignment**, and executes **file operations** (copy/move/delete/mkdir) safely.

**Primary design goals**:

* Deterministic behavior across independent implementations.
* Partial/incremental scans that remain usable while scanning.
* Explainable identity decisions (evidence + confidence).

---

## 0. Scope

### 0.1 In scope

1. OS directory scanning into a normalized virtual namespace.
2. Archive‑as‑directory support via pluggable `ArchiveReader`.
3. Snapshots with incremental patch (partial subtree).
4. DB‑oriented snapshot query API and required index shapes.
5. 2‑way snapshot diff (STRICT/LENIENT) with evidence‑based identity.
6. Multi‑snapshot alignment matrix for cluster views.
7. Operation planning and execution (copy/move/delete/mkdir) with dry‑run and progress.
8. On‑demand resolution (`Resolver`) to validate existence at time of access.

### 0.2 Out of scope

* Domain semantics (e.g., comics chapter grouping, perceptual video/image algorithms).
* Full N‑way merge/sync policy decisions.

---

## 1. Conformance language

* **MUST / MUST NOT / SHOULD / MAY** are normative.
* All timestamps are RFC3339 UTC with millisecond precision: `YYYY-MM-DDTHH:mm:ss.SSSZ`.

  * Implementations MUST emit this format.
  * Implementations MAY parse other RFC3339 precisions.

---

## 2. Paths and Roots

### 2.1 OS path vs virtual path

* **OsPath**: OS‑native path string (Windows/POSIX).
* **VPath**: OS‑independent, normalized, percent‑encoded path used by this spec.

### 2.2 Root

A **Root** is a registered OS directory that defines the base of a VPath tree.

#### 2.2.1 RootId and RootKey

* `rootId`: opaque persistent identifier (e.g., UUID) used internally.
* `rootKey`: deterministic key used for re‑resolution and deduplication of root registration.

##### RootKey normalization rules (normative)

**Windows** (`winpath:`):

* Input MUST be converted to an absolute path.
* Separator MUST be `\`.
* Drive letter MUST be uppercase.
* Trailing `\` MUST be removed **except** when the path is exactly `X:\`.
* `.` and `..` MUST be resolved.
* If input uses `\\?\` long‑path prefix, it MUST be removed in `rootKey` (store may keep original in `osPath`).
* UNC paths MUST be preserved as `\\server\share\...`.

**POSIX** (`posixpath:`):

* Input MUST be converted to an absolute path.
* Duplicate slashes MUST be collapsed.
* Trailing `/` MUST be removed **except** when the path is exactly `/`.
* `.` and `..` MUST be resolved.

`rootKey` examples:

* `winpath:C:\foo`
* `posixpath:/mnt/photos`

### 2.3 VPath string rules

#### 2.3.1 Grammar

* VPath MUST start with `/`.
* Separator is `/`.
* Empty segments are not allowed (no `//`).
* Normalized VPaths MUST NOT end with `/` (except root `/`).

#### 2.3.2 Segment normalization

* `.` segments MUST be removed.
* `..` segments MUST be rejected (error `INVALID_VPATH_PARENT_SEGMENT`).

#### 2.3.3 Percent‑encoding (fully specified)

A VPath segment is produced from a Unicode string as:

1. Take the segment string as provided by OS APIs (no Unicode normalization is applied).
2. Encode to UTF‑8 bytes.
3. For each byte:

   * If the byte is an RFC3986 **unreserved** character: `ALPHA / DIGIT / '-' / '.' / '_' / '~'`, it MAY remain unescaped.
   * Otherwise it MUST be percent‑encoded as `%HH` where `HH` is **uppercase** hex.

Implications:

* `%` becomes `%25`.
* `/` becomes `%2F` (inside segment).
* `!` becomes `%21` (inside segment).
* Space becomes `%20`.

Implementations MUST NOT use alternative escaping.

#### 2.3.4 Case policy

Stores/comparers MUST support per‑root case policy:

* `AUTO`, `SENSITIVE`, `INSENSITIVE`.
* If `casePolicy=AUTO`, it MUST be resolved as:

  * `SENSITIVE` when `RootCapabilities.caseSensitive=true`
  * `INSENSITIVE` when `RootCapabilities.caseSensitive=false`
    The resolved policy MUST be used for all comparisons and indexing.
* For `INSENSITIVE`, the store MUST maintain a `vpathFold` key used for indexing and comparisons.

  * `vpathFold` MUST be computed by applying **ASCII‑only** case folding to the normalized VPath string:

    * Map `A`–`Z` to `a`–`z`.
    * All other characters (including `%` and hex digits) are unchanged.
  * No Unicode normalization MUST be applied.

---

## 3. Layers, NodeRef, and Canonical String

### 3.1 Layers

Nodes exist in a layered namespace: OS layer + 0..N archive layers.

```text
enum LayerKind { OS, ARCHIVE }

struct VfsLayerOS {
  kind = OS
  rootId: RootId
}

struct VfsLayerArchive {
  kind = ARCHIVE
  format: string          // e.g. "zip", "7z", "rar"
  containerVPath: VPath   // VPath of the archive file in the previous layer
}

type VfsLayer = VfsLayerOS | VfsLayerArchive
```

### 3.2 NodeRef

```text
struct NodeRef {
  rootId: RootId
  layers: VfsLayer[]   // MUST start with OS layer
  vpath: VPath         // path within the topmost layer
}
```

### 3.3 Canonical string (serialization)

Implementations MUST provide:

* `toCanonicalString(ref: NodeRef) -> string`
* `parseCanonicalString(s: string) -> NodeRef`

Canonical format (normative):

* Prefix is the literal `root:`.
* The **rootId** is the substring after `root:` up to (but not including) the first occurrence of the delimiter `:/`.

  * This is unambiguous because every VPath begins with `/`.
  * Therefore, rootId MUST be non‑empty and MUST NOT contain `/`.
* After the delimiter `:/`, the remainder is the OS‑layer VPath followed by zero or more archive boundaries using `!`.

Examples:

* OS: `root:r:1f2c:/photos/a.jpg`
* Archive: `root:r:1f2c:/comics/A.zip!/001.png`
* Nested: `root:r:1f2c:/packs/A.7z!/B.zip!/x.jpg`

Note: literal `!` in names is represented as `%21` in VPath segments.

---

## 4. Identity, entityKey, firstSeenAt

### 4.1 OS‑level identity

```text
struct WindowsFileId { volumeId: string, fileId: string }
struct PosixFileId { dev: uint64, inode: uint64 }

enum IdentityPlatform { WINDOWS, POSIX, UNKNOWN }

struct FileIdentity {
  platform: IdentityPlatform
  windows?: WindowsFileId
  posix?: PosixFileId
  isAvailable: bool
}
```

#### 4.1.1 Identity value normalization (normative)

To ensure cross‑language determinism, identity components MUST be normalized as follows.

Windows:

* `WindowsFileId.volumeId` MUST be a volume GUID formatted as lowercase hex with hyphens and no braces.
* `WindowsFileId.fileId` MUST be the 128‑bit file ID encoded as lowercase hex with exactly 32 hex digits.
* If an implementation cannot obtain a 128‑bit file ID, it MUST set `identity.isAvailable=false`.

POSIX:

* `PosixFileId.dev` and `PosixFileId.inode` MUST be encoded into the canonical identity string as base‑10 ASCII digits with no leading zeros (except the value 0).

Canonical identity string:

* Windows: `win:<volumeId>:<fileId>`
* POSIX: `posix:<dev>:<inode>`

### 4.2 entityKey derivation (deterministic)

Each node has an `entityKey` string derived as:

1. If OS identity available:

   * Windows: `win:<volumeId>:<fileId>`
   * POSIX: `posix:<dev>:<inode>`
2. Else fallback:

   * `path:<rootId>:<layersSigHash>:<vpathKey>`

Where:

* `vpathKey` is `vpathFold` for case‑insensitive roots, else `vpath`.
* `layersSigHash` is `sha256(canonicalJson(layers))` in lowercase hex (Appendix B).

### 4.3 firstSeenAt semantics

* `firstSeenAt` is stored **per entityKey**.
* A store MUST set `firstSeenAt` the first time an entityKey is observed.
* Rename/move MUST NOT change `firstSeenAt`.

---

## 5. Node DTOs

```text
type RootId = string
type RootKey = string
type SnapshotId = string
type RunId = string
type NodeId = string

type Instant = string   // RFC3339 with milliseconds

enum NodeKind { FILE, DIR, SYMLINK, SPECIAL }

// NodeKind.SPECIAL (normative):
// - Represents filesystem objects that are not regular files/dirs/symlinks, such as device nodes, sockets, FIFOs, and other OS-specific special types.
// - SPECIAL nodes are treated as leaf nodes (the scanner MUST NOT descend as if they were directories).
// - `openRead` MAY fail for SPECIAL nodes; such failures SHOULD be reported as NodeError with an OS-specific code.

enum HashStatus { PRESENT, MISSING, ERROR }

struct NodeError { code: ErrorCode, stage: ErrorStage, message: string, retryable: bool, osCode?: string, at: Instant }

struct HashValue { algo: string, value?: string, status: HashStatus, error?: NodeError }

struct ObservedNode {
  // Scanner output / Store upsert input
  ref: NodeRef
  kind: NodeKind
  name: string

  size?: uint64
  mtime?: Instant
  ctime?: Instant
  birthtime?: Instant

  identity: FileIdentity

  hashes: { [k: string]: HashValue }
  extras: any

  observedInRunId: RunId
  lastObservedAt: Instant

  errors: NodeError[]
}

struct NodeMeta {
  nodeId: NodeId
  ref: NodeRef
  kind: NodeKind
  name: string

  size?: uint64
  mtime?: Instant
  ctime?: Instant
  birthtime?: Instant

  identity: FileIdentity
  entityKey: string
  firstSeenAt: Instant

  // deletion/tombstone
  isDeleted: bool
  deletedAt?: Instant

  hashes: { [k: string]: HashValue }
  extras: any

  observedInRunId: RunId
  lastObservedAt: Instant

  errors: NodeError[]
}
```

Rules:

* The root directory itself MUST exist as a `DIR` node at `vpath="/"` (OS layer) in every snapshot.
* `isDeleted=false` for active nodes.

Ownership / upsert contract (normative):

* The Scanner MUST emit `ObservedNode` objects.
* `PatchSession.upsertNodes()` MUST accept `ObservedNode` and the store MUST materialize/maintain `NodeMeta`.
* The store MUST assign and persist `nodeId`.
* The store MUST compute `entityKey` deterministically from this spec.
* The store MUST manage `firstSeenAt` (entity‑level) and tombstone fields (`isDeleted`, `deletedAt`).

---

## 6. Errors

```text
enum ErrorStage {
  LIST, STAT, OPEN, READ,
  ARCHIVE_LIST, ARCHIVE_STAT, ARCHIVE_OPEN, ARCHIVE_READ,
  STORE_READ, STORE_WRITE,
  EXECUTE
}

enum ErrorCode {
  PERMISSION_DENIED,
  NOT_FOUND,
  IO_ERROR,
  PATH_TOO_LONG,
  BROKEN_SYMLINK,
  ARCHIVE_CORRUPT,
  ARCHIVE_ENCRYPTED,
  ARCHIVE_UNSUPPORTED,
  ENCODING_ERROR,
  INVALID_VPATH_PARENT_SEGMENT,
  INVALID_VPATH_FORMAT,
  STORE_CONFLICT,
  UNKNOWN
}
```

### 6.1 onError vs NodeMeta.errors

* If an error is attributable to a specific `NodeRef`, the Scanner MUST:

  1. add it to that node’s `ObservedNode.errors` (and the store MUST persist it into `NodeMeta.errors`), and
  2. MAY also emit it via `ScanSink.onError`.
* If an error is run‑level (not attributable to a node), the Scanner MUST emit it via `ScanSink.onError`.

---

## 7. Archive API

```text
enum OpenCostModel { RANDOM_CHEAP, RANDOM_EXPENSIVE, STREAM_ONLY }

struct ArchiveCapabilities {
  canListEntries: bool
  canStatEntry: bool
  canOpenStream: bool
  canSeek: bool
  openCostModel: OpenCostModel
}

struct ArchiveEntry {
  entryVPath: VPath
  kind: NodeKind
  size?: uint64
  mtime?: Instant
}

interface ArchiveReader {
  supports(format: string): bool
  capabilities(format: string): ArchiveCapabilities
  open(container: ReadableSource, format: string, options: ArchiveOpenOptions): ArchiveHandle
}

interface ArchiveHandle {
  // If prefix is omitted, lists whole archive.
  // If prefix is provided, MUST list recursively under that prefix.
  // Return order MUST be lexicographic ascending by entryVPath.
  // "lexicographic" means unsigned byte-order comparison of UTF-8 bytes.
  listEntries(prefix?: VPath): Iterable<ArchiveEntry>

  statEntry(entryVPath: VPath): ArchiveEntry
  openEntryStream(entryVPath: VPath): ReadableStream
  openEntryRange?(entryVPath: VPath, offset: uint64, length: uint64): ReadableStream
  close(): void
}
```

Archive security:

* Entry paths that attempt traversal (`..`) or absolute paths MUST be rejected.

Zip entry name normalization (normative):

* Decoding:

  * If the ZIP UTF‑8 flag is set, decode entry names as UTF‑8.
  * Otherwise, decode as CP437.
  * If decoding fails, the reader MUST report `ENCODING_ERROR` and MUST skip the entry.
* Path normalization:

  * Replace `\` with `/`.
  * Remove any leading `./` segments.
  * Reject absolute paths (leading `/`) and any `..` segment.
  * Reject empty segments (no `//`).
* VPath generation:

  * Split the normalized Unicode path into segments by `/`.
  * Percent‑encode each segment per VPath rules and re‑join with `/` to form `entryVPath`.

The above rules apply before emitting `entryVPath` or computing archive‑layer NodeRefs.

---

## 8. VFS API

```text
interface Vfs {
  listChildren(ref: NodeRef): Iterable<NodeRef>
  stat(ref: NodeRef): NodeMeta
  openRead(ref: NodeRef): ReadableStream
  openReadRange?(ref: NodeRef, offset: uint64, length: uint64): ReadableStream
}
```

Rules:

* For archive nodes, `identity.isAvailable=false`.

---

## 9. Scanner API

### 9.1 Policies

```text
enum ErrorPolicy { FAIL_FAST, CONTINUE_AND_REPORT, SKIP_SUBTREE }

enum SymlinkPolicy { DONT_FOLLOW, FOLLOW_SAFE, FOLLOW_ALL }

// FOLLOW_SAFE semantics (normative):
// - MAY follow symlinks/reparse points only if the resolved target remains within the root.
// - MUST perform cycle detection and MUST NOT traverse into cycles.
// - Junctions/reparse points are treated as links on Windows.

struct ArchivePolicy {
  includeArchives: bool
  formats: string[]
  maxNesting: uint32
  onEncrypted: ErrorPolicy
}

struct IgnoreRules {
  glob: string[]
  regex: string[]
}

struct ScanPolicy {
  errorPolicy: ErrorPolicy
  symlinkPolicy: SymlinkPolicy
  archivePolicy: ArchivePolicy
}

struct Concurrency { io: uint32, cpu: uint32 }
```

### 9.2 IgnoreRules matching (fully specified)

* IgnoreRules are evaluated against the **normalized VPath string form** (percent‑encoded, leading `/` included).
* Case handling MUST follow the resolved case policy.
* Glob syntax (normative):

  * `*` matches zero or more characters except `/`.
  * `?` matches exactly one character except `/`.
  * `**` matches zero or more characters including `/`.
  * Character classes: `[abc]`, ranges `[a-z]`.
  * `\` escapes the next character.
* Match model:

  * A glob that begins with `/` is anchored to the beginning.
  * A glob without leading `/` is treated as `**/<pattern>`.
  * A match applies to a node if it matches the node’s VPath.
* Directory pruning (normative):

  * If a `DIR` node matches an ignore rule, the scanner MUST NOT descend into that directory (the entire subtree is skipped).
  * Ignored nodes (files or directories) MUST NOT be emitted via `onNodes`.
* Regex rules (normative):

  * `IgnoreRules.regex` patterns MUST use **RE2** syntax (no backreferences, no lookbehind).
  * Regex is evaluated against the same target string as glob (normalized VPath string; or `vpathFold` when insensitive).
  * Patterns are unanchored by default; callers may use `^`/`$` for anchoring.
  * Regex flags are not supported; case behavior is controlled by case policy via the target string.

### 9.3 Request / Sink / Control

```text
enum ScopeMode { SINGLE_NODE, CHILDREN_ONLY, FULL_SUBTREE }

struct ScanScope { baseVPath: VPath, mode: ScopeMode }

struct ScanRequest {
  snapshotId: SnapshotId
  rootId: RootId
  scopes: ScanScope[]
  policy: ScanPolicy
  ignore: IgnoreRules
  concurrency: Concurrency
}

enum RunStatus { RUNNING, FINISHED, CANCELED, FAILED }

struct ScanRun {
  runId: RunId
  rootId: RootId
  startedAt: Instant
  finishedAt?: Instant
  requestedScopes: ScanScope[]
  status: RunStatus
}

enum ScopeCompleteness { COMPLETE, PARTIAL }

struct CoverageScope {
  scope: ScanScope
  completeness: ScopeCompleteness
  // OPTIONAL: representative errors that caused PARTIAL completeness.
  // Errors MAY be aggregated/sampled to avoid large payloads.
  errors?: NodeError[]
}

struct Coverage { runId: RunId, scopes: CoverageScope[] }

interface ScanSink {
  onRunStarted(run: ScanRun): void
  onNodes(batch: ObservedNode[]): void
  onError(error: NodeError): void
  onRunFinished(run: ScanRun, coverage: Coverage): void
}

interface ScanControl { cancel(): void, pause?(): void, resume?(): void }

interface Scanner {
  startScan(req: ScanRequest, sink: ScanSink): { run: ScanRun, control: ScanControl }
}
```

### 9.4 Coverage recording rule (normative)

For each requested `ScanScope`, the scanner MUST record a `CoverageScope`:

* `completeness=COMPLETE` only if the scope’s enumeration obligations were fully satisfied:

  * `FULL_SUBTREE`: the scanner successfully enumerated the subtree rooted at `baseVPath` without any enumeration‑blocking errors (permission/IO/cancel/skip) that prevent discovering some descendants.
  * `CHILDREN_ONLY`: the scanner successfully enumerated the direct children of `baseVPath` without any enumeration‑blocking errors.
  * `SINGLE_NODE`: the scanner successfully observed or conclusively determined non‑existence of that single node.
* Otherwise the scanner MUST set `completeness=PARTIAL`.

Notes:

* A run MAY finish successfully while some scopes are PARTIAL (e.g., due to `CONTINUE_AND_REPORT` or `SKIP_SUBTREE`).
* When `completeness=PARTIAL`, the scanner SHOULD include representative errors in `CoverageScope.errors`.

### 9.5 Archive emission rule (normative)

When `archivePolicy.includeArchives=true`:

1. The container archive file (e.g., `/A.zip`) MUST be emitted as a normal OS `FILE` node.
2. The archive root directory MUST be emitted as a `DIR` node with layers extended by an ARCHIVE layer and `vpath="/"`.
3. Archive entries MUST be emitted under that archive layer.

---

## 10. SnapshotStore API (DB‑oriented)

### 10.1 Snapshot

```text
struct Snapshot {
  snapshotId: SnapshotId
  rootId: RootId
  createdAt: Instant
  lastPatchedAt: Instant
  lastRunId: RunId
  lastCoverage: Coverage  // coverage of the last completed run (not cumulative)
  // stats counts active nodes only (isDeleted=false)
  stats: { nodeCount: uint64, dirCount: uint64, fileCount: uint64 }
}
```

Snapshot.stats semantics (normative):

* `nodeCount`, `dirCount`, `fileCount` MUST count only active nodes (`isDeleted=false`) in the snapshot.
* The store MUST ensure `stats` observed via `getSnapshot()` reflects the latest committed state.

  * The store MAY compute stats lazily, but the returned values MUST be correct at read time.

### 10.2 Queries

```text
enum SortOrder { ASC, DESC }

enum NodeSortKey { NAME, VPATH, SIZE, MTIME, FIRST_SEEN_AT, LAST_OBSERVED_AT }

struct Page { limit: uint32, cursor?: string }

struct NodeFilter {
  kinds?: NodeKind[]
  vpathPrefix?: VPath
  observedInRunId?: RunId
  hasErrors?: bool
  minSize?: uint64
  maxSize?: uint64
  hash?: { algo: string, value: string }
  entityKey?: string
  includeDeleted?: bool   // default false
}

struct NodeQuery { filter?: NodeFilter, sort?: { key: NodeSortKey, order: SortOrder }, page?: Page }

struct NodeQueryResult { nodes: NodeMeta[], nextCursor?: string }
```

Deterministic ordering (normative):

* All store query results that support sorting/pagination (`listChildren`, `queryNodes`, and index queries) MUST apply stable tie‑breakers.
* For any primary sort key, the store MUST apply:

  1. primary key (as requested)
  2. `toCanonicalString(node.ref)` ascending
  3. `nodeId` ascending
* String comparisons in sorting MUST be lexicographic by unsigned byte order of UTF‑8 bytes (binary/bytewise collation; locale/case‑insensitive collations MUST NOT be used).

  * Implementations MUST configure DB collation accordingly (binary/bytewise), or emulate it in application code.

### 10.3 Store interfaces

```text
struct RootCapabilities { caseSensitive: bool, supportsFileId: bool }

enum OsKind { WINDOWS, POSIX }

enum CasePolicy { AUTO, SENSITIVE, INSENSITIVE }

struct RootDescriptor {
  rootId: RootId
  rootKey: RootKey
  os: OsKind
  osPath: OsPath
  createdAt: Instant
  casePolicy: CasePolicy
  capabilities: RootCapabilities
}

interface SnapshotStore {
  // Roots
  registerRoot(desc: RootDescriptor): RootDescriptor
  getRoot(rootId: RootId): RootDescriptor
  findRootByKey(rootKey: RootKey): RootDescriptor?

  // Snapshots
  createSnapshot(rootId: RootId): Snapshot
  getSnapshot(snapshotId: SnapshotId): Snapshot

  // Patch lifecycle (transactional)
  beginPatch(snapshotId: SnapshotId, run: ScanRun): PatchSession

  // Lookups
  getNodeById(snapshotId: SnapshotId, nodeId: NodeId): NodeMeta?
  getNodeByRef(snapshotId: SnapshotId, ref: NodeRef, includeDeleted?: bool): NodeMeta?

  // Navigation
  listChildren(
    snapshotId: SnapshotId,
    parentRef: NodeRef,
    sort?: {key: NodeSortKey, order: SortOrder},
    page?: Page,
    includeDeleted?: bool
  ): NodeQueryResult

  // Index queries
  findByEntityKey(snapshotId: SnapshotId, entityKey: string, page?: Page, includeDeleted?: bool): NodeQueryResult
  findByOsIdentity(snapshotId: SnapshotId, identityValue: string, page?: Page, includeDeleted?: bool): NodeQueryResult
  findByHash(snapshotId: SnapshotId, algo: string, value: string, page?: Page, includeDeleted?: bool): NodeQueryResult
  rangeBySize(snapshotId: SnapshotId, min: uint64, max: uint64, page?: Page, includeDeleted?: bool): NodeQueryResult

  // Generic query
  queryNodes(snapshotId: SnapshotId, query: NodeQuery): NodeQueryResult

  // Maintenance (optional)
  purgeDeleted?(snapshotId: SnapshotId, deletedBefore: Instant, vpathPrefix?: VPath): uint64
}

interface PatchSession {
  upsertNodes(nodes: ObservedNode[]): void
  recordCoverage(coverage: Coverage): void

  // commit MUST perform deletion reconciliation for COMPLETE scopes in recorded coverage (see 10.4).
  // If recordCoverage was not called, commit MUST fail.
  commit(): void
  abort(): void
}
```

### 10.4 Deletion detection and tombstones (normative)

When a patch session is committed for a run:

1. The store MUST apply `upsertNodes` as the set of observed nodes for that run.
2. The store MUST reconcile deletions **only within COMPLETE covered scopes** as part of `commit()`.

   * If a scope is `PARTIAL`, the store MUST NOT mark deletions based on non‑observation under that scope.
3. For each `CoverageScope` with `completeness=COMPLETE`, deletion reconciliation is:

   * For `FULL_SUBTREE` scope at `P`:

     * Any existing node with `vpath` under prefix `P` (inclusive) and `observedInRunId != runId` MUST be marked as deleted (`isDeleted=true`).
   * For `CHILDREN_ONLY` scope at `P`:

     * Only the immediate children of `P` are reconciled (grandchildren are untouched).
       -For `SINGLE_NODE` scope at `P`:
     * Only the node at `P` is reconciled.

Immediate children definition (normative):

* Normalized VPaths MUST NOT end with `/` (except root `/`).
* For a parent VPath `P`:

  * If `P == "/"`, an immediate child has VPath `"/" + name` where `name` contains no `/`.
  * Else, an immediate child has VPath `P + "/" + name` where `name` contains no `/`.
* This definition MUST be used consistently for both coverage and deletion reconciliation.

4. Tombstone fields:

   * When a node is first marked deleted, the store MUST set `deletedAt=now`.
   * If a node is already deleted (`isDeleted=true`), deletion reconciliation MUST NOT update `deletedAt`.
5. Reappearance / undelete:

   * If an `upsertNodes` call provides a node whose `NodeRef` matches an existing tombstone in the snapshot, the store MUST treat it as an undelete:

     * set `isDeleted=false`
     * clear `deletedAt`
     * preserve `firstSeenAt` (entityKey‑level)
6. Deleted nodes MUST remain in the store as tombstones unless an implementation provides a purge mechanism (Appendix C).
7. Default query behavior MUST exclude deleted nodes unless `includeDeleted=true`.

---

## 11. Resolver API

```text
struct ResolveResult { exists: bool, meta?: NodeMeta, error?: NodeError }

interface Resolver { statNow(ref: NodeRef): ResolveResult }
```

---

## 12. Compare API (2‑way diff)

### 12.1 Evidence

```text
enum EvidenceType { OS_FILE_ID, VPATH, NAME, SIZE, MTIME, CONTENT_HASH, PERCEPTUAL_HASH }

enum EvidenceOutcome { MATCH, MISMATCH, MISSING_LEFT, MISSING_RIGHT, NOT_APPLICABLE }

struct Evidence { type: EvidenceType, outcome: EvidenceOutcome, leftValue?: string, rightValue?: string, weight: float64 }

enum Verdict { SAME, DIFFERENT, POSSIBLY_SAME, UNKNOWN, MOVED }

enum Confidence { CERTAIN, LIKELY, POSSIBLE }

type MatchScore = float64

struct MatchResult {
  verdict: Verdict
  confidence: Confidence
  evidence: Evidence[]
  matchScore?: MatchScore
  mismatchScore?: MatchScore
}
```

### 12.2 Policies

```text
struct WeightedStrategy { type: EvidenceType, weight: float64 }

enum ConflictHandling { PREFER_STRONGER_EVIDENCE, MARK_CONFLICT }

struct ScoreThresholds {
  sameCertain: float64        // default 0.80
  sameLikely: float64         // default 0.50
  differentCertain: float64   // default 0.80
}

struct IdentityPolicy {
  strategies: WeightedStrategy[]
  conflictHandling: ConflictHandling
  thresholds: ScoreThresholds
  casePolicy: CasePolicy
}

struct MovePolicy { enabled: bool, strategies: EvidenceType[], minConfidence: Confidence }

struct DuplicatePolicy { keys: EvidenceType[], minGroupSize: uint32 }
```

### 12.3 Scope and modes

```text
enum CompareMode { STRICT, LENIENT }

struct CompareScope { baseVPath: VPath, mode: ScopeMode }

struct CompareOptions {
  mode: CompareMode
  scope: CompareScope
  identity: IdentityPolicy
  move: MovePolicy
  duplicates?: DuplicatePolicy
  requireObservedCoverage: bool
}
```

### 12.4 Diff result

```text
enum DiffEntryType { ADDED, REMOVED, MODIFIED, MOVED, TYPE_CHANGED, CONFLICT, UNKNOWN, NOT_COVERED }

struct DiffNodePtr { snapshotId: SnapshotId, nodeId?: NodeId, ref?: NodeRef }

struct DiffEntry {
  // Path in the comparison namespace.
  // - For compare(): this is the absolute VPath under the compared root scope.
  // - For compareSubtree(): this is the VPath relative to the provided base refs.
  path: VPath

  type: DiffEntryType
  left?: DiffNodePtr
  right?: DiffNodePtr
  match?: MatchResult
  notes?: string
}

struct DiffSummary { added: uint64, removed: uint64, modified: uint64, moved: uint64, unknown: uint64, notCovered: uint64 }

struct DiffResult { summary: DiffSummary, entries: DiffEntry[] }

interface Comparer {
  compare(leftSnapshotId: SnapshotId, rightSnapshotId: SnapshotId, opts: CompareOptions): DiffResult

  compareSubtree(
    leftSnapshotId: SnapshotId,
    leftBase: NodeRef,
    rightSnapshotId: SnapshotId,
    rightBase: NodeRef,
    opts: CompareOptions
  ): DiffResult
}
```

### 12.5 Coverage rules (deterministic)

Coverage in this specification is **not cumulative**.

* `snapshot.lastCoverage` describes only the scopes scanned in the snapshot’s **last completed run**.
* A snapshot MAY contain nodes outside `lastCoverage` from prior runs/patches; those nodes MUST NOT make a scope “covered” for Compare/Align.

A snapshot covers a requested scope `S` iff `snapshot.lastCoverage.scopes` contains a `CoverageScope` that fully covers it **and** has `completeness=COMPLETE`.

* `FULL_SUBTREE` at `P` covers all descendants.
* `CHILDREN_ONLY` covers only immediate children (as defined in 10.4).
* `SINGLE_NODE` covers only itself.

STRICT:

* If `requireObservedCoverage=true` and either snapshot does not cover `S`, the comparer MUST return `NOT_COVERED` and MUST NOT infer ADDED/REMOVED.

LENIENT:

* For paths not covered, the comparer MUST output `UNKNOWN` rather than ADDED/REMOVED.

### 12.6 compareSubtree semantics (normative)

Given:

* `leftBase` (in `leftSnapshotId`) and `rightBase` (in `rightSnapshotId`)
* `opts.scope` whose `baseVPath` is interpreted **relative to each base**

The comparer MUST:

1. Define a comparison namespace where both bases correspond to `/`.
2. For any relative path `R` under `opts.scope`, map to absolute NodeRefs:

   * Left: `NodeRef{ rootId=leftBase.rootId, layers=leftBase.layers, vpath=joinVPath(leftBase.vpath, R) }`
   * Right: `NodeRef{ rootId=rightBase.rootId, layers=rightBase.layers, vpath=joinVPath(rightBase.vpath, R) }`
3. Apply the same diff logic as `compare()` on the mapped views.
4. Populate `DiffEntry.path` with the **relative** path `R` for every entry.

Coverage evaluation for `compareSubtree`:

* Coverage MUST be evaluated on the **mapped absolute** scope for each side.

Node inclusion (tombstones):

* When the requested scope is covered, the comparer MUST treat tombstones (`isDeleted=true`) as present for the purpose of producing `REMOVED` entries.
* Implementations SHOULD read nodes with `includeDeleted=true` during comparison within covered scopes.

Helper `joinVPath(a, b)`:

* Both `a` and `b` are normalized VPaths.
* Normalized VPaths MUST NOT end with `/` (except root `/`).
* If `a` is `/`, result is `b`.
* Else if `b` is `/`, result is `a`.
* Else result is `a` + `b` (with exactly one `/` between).

### 12.7 Match decision algorithm (normative)

Given two NodeMeta candidates (left, right):

1. Build Evidence list in the order of `identity.strategies`.
2. For each strategy type:

   * If the attribute is missing on either side, outcome is `MISSING_LEFT` / `MISSING_RIGHT`.
   * Else if equal under casePolicy rules, outcome `MATCH`; else `MISMATCH`.
3. Compute:

   * `matchScore = sum(weight where outcome=MATCH)`
   * `mismatchScore = sum(weight where outcome=MISMATCH)`
4. Strong conflict detection:

   * A **strong conflict** exists when `matchScore >= thresholds.sameLikely` **and** `mismatchScore >= thresholds.differentCertain`.
   * If `identity.conflictHandling=MARK_CONFLICT` and a strong conflict exists, the comparer MUST:

     * return `MatchResult{ verdict=UNKNOWN, confidence=POSSIBLE, evidence=... }`, and
     * emit a `DiffEntry` with `type=CONFLICT` for this path.
5. Special rules:

   * If `CONTENT_HASH` is `MISMATCH` and its weight >= `thresholds.differentCertain`, verdict MUST be `DIFFERENT` with `CERTAIN`.
6. Otherwise (normal scoring):

   * If `mismatchScore >= thresholds.differentCertain` => `DIFFERENT/CERTAIN`.
   * Else if `matchScore >= thresholds.sameCertain` and `mismatchScore == 0` => `SAME/CERTAIN`.
   * Else if `matchScore >= thresholds.sameLikely` and `mismatchScore < thresholds.differentCertain` => `POSSIBLY_SAME/LIKELY`.
   * Else => `UNKNOWN/POSSIBLE`.

### 12.8 Move detection and MOVED output (normative)

Move emission is a global 1:1 pairing problem between left‑only and right‑only candidates.

#### 12.8.1 Candidate generation

Within the compared scope, the comparer MUST form candidate pairs from nodes that would otherwise be emitted as `ADDED` (right‑only) or `REMOVED` (left‑only) under the same CompareOptions.

* Candidates MUST be generated by evaluating identity strategies listed in `move.strategies`.
* A pair is eligible if its `MatchResult.verdict` is `SAME` or `POSSIBLY_SAME` and `confidence >= move.minConfidence`.

#### 12.8.2 Deterministic greedy pairing

If `move.enabled=true`, the comparer MUST apply the following deterministic greedy algorithm to select a set of disjoint moved pairs:

1. Build a list of eligible candidates `C`, each with:

   * `verdictPriority`: `SAME` > `POSSIBLY_SAME`
   * `confidencePriority`: `CERTAIN` > `LIKELY` > `POSSIBLE`
   * `matchScore` (from MatchResult)
   * `mismatchScore` (from MatchResult)
   * `strategyIndex`: the smallest index of a strategy in `move.strategies` that produced the candidate’s best evidence (lower is better)
   * `leftCanon = toCanonicalString(left.ref)`
   * `rightCanon = toCanonicalString(right.ref)`
2. Sort `C` by:

   * `verdictPriority` desc,
   * `confidencePriority` desc,
   * `matchScore` desc,
   * `mismatchScore` asc,
   * `strategyIndex` asc,
   * `leftCanon` asc,
   * `rightCanon` asc.
3. Iterate candidates in sorted order; select a candidate iff neither its left node nor its right node has been selected before.

#### 12.8.3 Output form

* For each selected pair whose VPath differs, the comparer MUST emit exactly one `DiffEntry` of type `MOVED`.
* When a `MOVED` entry is emitted for a pair of nodes, the comparer MUST NOT also emit corresponding `ADDED` and `REMOVED` entries for those same nodes.
* Any left‑only/right‑only nodes not selected into a moved pair MUST be represented as `REMOVED`/`ADDED`.
* If `move.enabled=false`, the comparer MUST represent changes as `ADDED`/`REMOVED` only.

---

## 13. Alignment API (multi‑snapshot)

### 13.1 Key strategy

```text
enum AlignKeyType { VPATH, ENTITY_KEY, OS_FILE_ID, CONTENT_HASH, COMPOSITE }

struct AlignKeyStrategy { type: AlignKeyType, parts?: AlignKeyType[] }
```

Default: `COMPOSITE([ENTITY_KEY, VPATH])`.

### 13.2 Matrix DTO

```text
enum CellState { PRESENT, MISSING, UNKNOWN, NOT_COVERED }

struct AlignmentCell {
  state: CellState
  nodes?: DiffNodePtr[]
  fingerprint?: { size?: uint64, mtime?: Instant, contentHash?: string }
}

struct AlignmentRow {
  rowKey: string
  displayKey: string
  cells: AlignmentCell[]
}

struct AlignmentResult {
  snapshotIds: SnapshotId[]
  scope: CompareScope
  strategy: AlignKeyStrategy
  rows: AlignmentRow[]
}

interface Aligner {
  align(snapshotIds: SnapshotId[], scope: CompareScope, strategy: AlignKeyStrategy, mode: CompareMode): AlignmentResult
}
```

### 13.3 Row key derivation (normative)

For each node within the requested scope, compute a **row key input string** based on `strategy`:

* `VPATH`: `vpathKey`
* `ENTITY_KEY`: `entityKey`
* `OS_FILE_ID`: canonical identity string if available else empty

  * Windows: `win:<volumeId>:<fileId>`
  * POSIX: `posix:<dev>:<inode>`
* `CONTENT_HASH`: `hash:<algo>:<value>` when status is `PRESENT` else empty
* `COMPOSITE(parts)`: compute each part above, then join with ASCII unit separator `\u001f`.

Then:

* `rowKey = "rk:" + sha256( utf8( "align:" + strategyName + "\u001f" + rowKeyInput ) )` as **lowercase hex**.
* `displayKey` SHOULD be the VPath when `VPATH` is part of the strategy; otherwise it SHOULD be the best available VPath for UI.

### 13.4 Examples (non‑normative)

Example 1 (VPATH):

* node vpathKey: `/backup/A.png`
* rowKeyInput: `/backup/A.png`
* rowKey: `rk:sha256("align:VPATH\u001f/backup/A.png")`

Example 2 (ENTITY_KEY):

* entityKey: `win:VOL123:FILE456`
* rowKey: `rk:sha256("align:ENTITY_KEY\u001fwin:VOL123:FILE456")`

Example 3 (COMPOSITE([ENTITY_KEY, VPATH])):

* entityKey: `win:VOL123:FILE456`
* vpathKey: `/backup/A.png`
* rowKeyInput: `win:VOL123:FILE456\u001f/backup/A.png`
* rowKey: `rk:sha256("align:COMPOSITE\u001fwin:VOL123:FILE456\u001f/backup/A.png")`

### 13.5 Multi‑candidate cells (normative)

If multiple nodes in the same snapshot compute to the same `rowKey`:

* The cell MUST include **all** matching nodes in `nodes[]`.
* Deterministic ordering MUST be:

  1. OS‑layer nodes before archive‑layer nodes,
  2. then by canonical string ascending.
* The cell `state` MUST be `PRESENT`.

Coverage semantics:

* STRICT: uncovered snapshot => `NOT_COVERED` cells.
* LENIENT: uncovered snapshot => `UNKNOWN` cells.

Ordering:

* Rows MUST be sorted ascending by `rowKey`.
* Ties MUST be broken by `displayKey` ascending.

---

## 14. Operations (Plan / Executor)

### 14.1 Operation model

```text
enum OpType { COPY, MOVE, DELETE, MKDIR }

enum ConflictPolicy { SKIP, OVERWRITE, RENAME, FAIL }

// ConflictPolicy.RENAME behavior (normative):
// - When the destination path already exists and conflict=RENAME, the executor MUST choose the smallest positive integer n
//   such that a renamed path does not exist, using the pattern `name (n)`.
// - If the destination has an extension, the suffix is inserted before the extension:
//     `file.txt` -> `file (1).txt`, `file (2).txt`, ...
// - If there is no extension:
//     `file` -> `file (1)`, `file (2)`, ...
// - This rule applies to both files and directories.
// - The selection MUST be deterministic with respect to the observed destination directory contents at execution time.

struct OpPolicy { conflict: ConflictPolicy }

struct Operation {
  opId: string
  type: OpType
  src?: NodeRef
  dst?: { rootId: RootId, vpath: VPath }   // OS‑layer destination only
  policy: OpPolicy
}

struct OperationPlan {
  planId: string
  createdAt: Instant
  ops: Operation[]
  preflight?: { conflicts: string[], missingSources: string[], estimates: { bytesToCopy?: uint64, opCount: uint64 } }
}
```

Field requirements (normative):

* `COPY`: `src` MUST be present; `dst` MUST be present.
* `MOVE`: `src` MUST be present; `dst` MUST be present.
* `DELETE`: `src` MUST be present; `dst` MUST NOT be present.
* `MKDIR`: `dst` MUST be present; `src` MUST NOT be present.

### 14.2 Executor capabilities (normative)

* Destination (`dst`) MUST refer to OS‑layer only.
* `COPY` MAY use an archive‑layer source (extract).
* `MOVE` MUST require OS‑layer source and OS‑layer destination.
* `DELETE` MUST require OS‑layer source.
* `MKDIR` MUST create OS‑layer directories only.

### 14.3 Execution interfaces

```text
enum OpStatus { OK, SKIPPED, FAILED }

struct OpResult { opId: string, status: OpStatus, error?: NodeError }

struct ExecutionReport { startedAt: Instant, finishedAt: Instant, results: OpResult[] }

interface ExecutionSink {
  onStarted(plan: OperationPlan): void
  onOpStarted(op: Operation): void
  onOpFinished(op: Operation, result: OpResult): void
  onError(err: NodeError): void
  onFinished(report: ExecutionReport): void
}

interface ExecControl { cancel(): void }

interface Executor {
  dryRun(plan: OperationPlan): OperationPlan
  execute(plan: OperationPlan, sink: ExecutionSink): { report: ExecutionReport, control: ExecControl }
}
```

---

## 15. Minimum implementation checklist

A conforming implementation MUST provide:

1. VPath normalization + RFC3986‑based percent encoding (uppercase `%HH`).
2. Root registry with rootId/rootKey normalization.
3. ArchiveReader interface and Zip reader.
4. VFS composition (OS + archives) with layers and canonical string.
5. Scanner with scopes, ignore rules, batching.
6. SnapshotStore with patch transactions, deletion reconciliation, and DB‑oriented queries.
7. Comparer (STRICT/LENIENT) with deterministic match algorithm and deterministic move pairing.
8. Aligner (alignment matrix).
9. Resolver.statNow.
10. Plan/Executor (OS‑layer operations; archive extraction via COPY).

---

## 16. Watcher (optional interface)

Watcher is best‑effort and MUST NOT be treated as a source of truth.

```text
enum WatchEventType { CREATED, DELETED, MODIFIED, RENAMED, OVERFLOW }

struct WatchEvent {
  type: WatchEventType
  rootId: RootId
  osPath?: OsPath
  oldOsPath?: OsPath
  newOsPath?: OsPath
  at: Instant
}

interface Watcher {
  start(rootId: RootId, osPath: OsPath): void
  stop(rootId: RootId): void
  onEvent(cb: (e: WatchEvent) => void): void
}
```

---

## Appendix A — DB Index requirements (guidance)

A DB‑backed store SHOULD implement at least:

1. PK `(snapshotId, nodeId)`
2. Unique NodeRef: `(snapshotId, rootId, layersSigHash, vpathKey)`
3. Children listing: `(snapshotId, parentKey, nameKey)`
4. Entity: `(snapshotId, entityKey)`
5. OS identity: `(snapshotId, identityValue)`
6. Hash index: `(snapshotId, algo, value)`
7. Size index: `(snapshotId, size)`
8. Prefix: `(snapshotId, vpathKey)` (DB‑dependent prefix optimization)

Derived columns note (normative):

* `layersSigHash`, `vpathKey`, `vpathFold`, `parentKey`, and `nameKey` are **store‑internal derived columns**.
* They do not need to appear in `NodeMeta`.
* However, when a store derives these columns, it MUST follow the definitions in this spec:

  * `layersSigHash` from Appendix B.
  * `vpathKey = vpathFold` for insensitive roots, else `vpath`.
  * `vpathFold` uses ASCII‑only folding (Section 2.3.4).
  * `parentKey` and `nameKey` MUST be derived deterministically:

    * `parentKey = "pk:" + sha256(utf8(toCanonicalString(parentRef)))` where `parentRef` is the parent NodeRef.

      * For the root node (`vpath="/"`), `parentKey` MUST be empty (or NULL).
    * `nameKey` MUST be a sortable binary key equal to the UTF‑8 bytes of:

      * `asciiFold(name)` when the resolved case policy is INSENSITIVE, else
      * `name` as stored.
    * `asciiFold` maps `A`–`Z` to `a`–`z` and leaves all other characters unchanged.

---

## Appendix B — Deterministic signatures

### B.1 layersSig canonical JSON

For hashing (entityKey fallback and indexes), layers MUST be serialized as canonical JSON:

* Array of objects in order.
* Keys sorted lexicographically.
* No whitespace.
* Strings are UTF‑8.

Example for OS + zip:

```json
[{"kind":"OS","rootId":"r:1f2c"},{"kind":"ARCHIVE","containerVPath":"/A.zip","format":"zip"}]
```

### B.2 layersSigHash

* `layersSigHash = sha256(layersSigJsonUtf8)` represented as lowercase hex.

---

## Appendix C — Tombstone retention and purge (guidance)

Tombstones (`isDeleted=true`) accumulate over time, especially with frequent partial scans. Implementations SHOULD provide a maintenance mechanism to reclaim storage.

Recommended retention policy:

1. Keep tombstones for at least **N days** or **M runs** so apps can display recent deletions.
2. Purge tombstones older than the retention window.
3. Purge SHOULD NOT remove active nodes.

Recommended purge behavior:

* If `SnapshotStore.purgeDeleted` is implemented:

  * It SHOULD remove tombstones where `deletedAt < deletedBefore`.
  * If `vpathPrefix` is provided, it SHOULD only purge tombstones whose `vpath` is under that prefix.
  * It SHOULD also remove any secondary index rows that reference purged nodes.

Entity table considerations:

* If the store maintains a separate `entities(entityKey)` table, it MAY keep entity rows indefinitely.
* Optionally, it MAY purge entity rows that have no active nodes and whose lastSeenAt is older than a retention window.

End of document.

