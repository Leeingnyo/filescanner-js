# Reference: core types

This page summarizes the “shape” of the most important types.
For the authoritative definitions, see `src/types/*` and `spec.md`.

## IDs and primitives

- `RootId`, `SnapshotId`, `RunId`, `NodeId`: `string`
- `Instant`: RFC3339 timestamp `string`
- `VPath`: normalized virtual path `string`

## Node kinds and errors

- `NodeKind`: `FILE | DIR | SYMLINK | SPECIAL`
- `NodeError`: `{ code, stage, message, retryable, osCode?, at }`

## Refs and layers

- `NodeRef`: `{ rootId, layers, vpath }`
- `LayerKind`: `OS | ARCHIVE`
- `VfsLayerArchive`: `{ kind: ARCHIVE, format, containerVPath }`

## Scan

- `ObservedNode`: scanner output (streamed in batches)
- `NodeMeta`: stored form (adds `nodeId`, `entityKey`, `firstSeenAt`, tombstone fields, etc.)
- `Coverage`: `{ runId, scopes: CoverageScope[] }`
- `CoverageScope`: `{ scope, completeness, errors? }`
