# How-to: ignore files/dirs (glob + regex)

Ignore rules are evaluated against the **normalized VPath string** (starts with `/`, percent-encoded).

## Glob rules

Supported operators:

- `*` matches within a segment (no `/`)
- `?` matches one char (no `/`)
- `**` matches across segments (can include `/`)
- `[a-z]` character classes
- `\\` escapes the next character

Anchoring:

- Patterns starting with `/` are anchored at the VPath root.
- Patterns without leading `/` behave like `**/<pattern>`.

Examples:

```ts
ignore: {
  glob: [
    '**/node_modules/**',
    '**/*.tmp',
    '/.DS_Store'
  ],
  regex: []
}
```

## Regex rules

Regex patterns use **RE2 syntax** (no backreferences, no lookbehind).

Example:

```ts
ignore: {
  glob: [],
  regex: ['^/private/.*', '\\\\.(jpg|png)$']
}
```

## Directory pruning

If a directory VPath matches ignore rules, the scanner should skip descending into that subtree.

