# Benchmarks

These scripts are lightweight benchmarks for local performance checks. They are **not** part of the build or test pipeline.

## Prerequisites

- Run `yarn build` so `dist/` is up to date.
- Node.js 18+ recommended.

## Scan benchmark

```bash
node scripts/bench/scan.bench.js --files 100000 --depth 4 --branch 8
```

Options:
- `--files`: number of files (default 10,000)
- `--depth`: directory depth (default 3)
- `--branch`: branching factor per depth (default 8)
- `--archives`: number of zip files to include (default 0)
- `--keep`: keep temp fixtures

## Compare benchmark

```bash
node scripts/bench/compare.bench.js --files 50000 --changes 1000 --moves 1000
```

Options:
- `--changes`: number of files with modified content
- `--moves`: number of moved files

## Store benchmark

```bash
node scripts/bench/store.bench.js --files 50000 --repeat 5
```

Options:
- `--repeat`: repeats for query/list loops

All scripts generate temp fixtures by default and clean them up unless `--keep` is provided.
