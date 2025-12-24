# Explanation: VPath and RootKey

## VPath (virtual path)

`VPath` is an OS-independent, normalized path string used everywhere in the library.

Key rules (see `spec.md` for the normative definition):

- Must start with `/`
- No empty segments (`//`)
- `.` segments are removed
- `..` segments are rejected
- Segments are percent-encoded from UTF-8 bytes using RFC3986 “unreserved” characters; all other bytes become uppercase `%HH`

Why percent-encoding?

- Determinism across platforms and languages
- Ability to represent arbitrary OS filenames safely inside a `/`-separated namespace

Related implementation:

- Encoding: `src/vpath/encode.ts`
- Decoding: `src/vpath/decode.ts`
- Normalization: `src/vpath/normalize.ts`

## RootKey (root identity)

`RootKey` is a deterministic key for “this root directory”, used for deduplication and re-resolution.

It includes an OS prefix:

- `posixpath:/abs/path`
- `winpath:C:\\Abs\\Path`

Normalization rules are in `spec.md` and implemented in `src/root/normalizeRootKey.ts` (not currently exported from `src/index.ts`).

