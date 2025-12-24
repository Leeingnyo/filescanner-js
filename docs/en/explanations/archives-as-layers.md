# Explanation: archives as directory layers

When archive scanning is enabled, archive contents are represented as an additional VFS layer.

## The idea

- The archive file is still a normal OS-layer `FILE` node.
- Its contents are exposed in a child “archive layer” with its own root directory at `vpath="/"`.

This is why `NodeRef` includes `layers[]`: it avoids collisions between:

- `/photos/A.zip` (OS file)
- `/photos/A.zip!/` (archive root directory)
- `/photos/A.zip!/001.png` (archive entry)

## Canonical string

Canonical string is a stable serialization of NodeRefs. In this implementation:

- `toCanonicalString(ref)` and `parseCanonicalString(s)` live in `src/node/canonical.ts`.

Note: the canonical string format is defined in `spec.md`; implementation details (e.g., format inference for archive layers) follow that.

