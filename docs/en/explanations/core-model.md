# Explanation: the core model (Root → VPath → NodeRef → NodeMeta)

## The chain of concepts

1) **Root**: an OS directory you registered (has `rootId`, `rootKey`, `osPath`, `casePolicy`, capabilities).
2) **VPath**: a normalized virtual path string, always relative to a conceptual root namespace.
3) **NodeRef**: a stable pointer to “a node in a layered virtual filesystem”:
   - `rootId`
   - `layers` (OS + optional archive layers)
   - `vpath` (within the topmost layer)
4) **ObservedNode**: what the scanner emits during a run (stream of observations).
5) **NodeMeta**: what the store persists (ObservedNode + derived fields like `entityKey`, `firstSeenAt`, tombstone flags).

## Layers: OS + archive(s)

`layers` always starts with an OS layer. Each archive nesting adds an archive layer that points at its container file by VPath.

Example (conceptual):

- OS file: `/comics/A.zip`
- Entry inside: `/001.png`
- NodeRef layers: `[OS(rootId), ARCHIVE(format="zip", containerVPath="/comics/A.zip")]`

See `docs/en/explanations/archives-as-layers.md`.

## entityKey: “identity for matching”

Stores derive `entityKey` deterministically:

- If OS identity exists, it becomes the entityKey (e.g., `win:<volumeId>:<fileId>` or `posix:<dev>:<inode>`)
- Otherwise, it falls back to `path:<rootId>:<layersSigHash>:<vpathKey>`

Implementation: `src/node/entityKey.ts`.

