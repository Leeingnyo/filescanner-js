# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the TypeScript implementation (ESM with `.js` import paths).
- Unit tests are colocated as `src/**/*.unit.test.ts`.
- Integration tests live under `test/integration/**/*.int.test.ts`; E2E tests (if any) under `test/e2e/**/*.e2e.test.ts`.
- Documentation is in `docs/` following the 4‑document model (tutorials, how‑to, explanations, reference).
- `spec.md` defines normative behavior; `dist/` and `coverage/` are generated outputs.

Prefer small, single‑responsibility modules and split new interfaces into focused files.

## Build, Test, and Development Commands

- `yarn build` — compile TypeScript via `tsc`.
- `yarn test` — run all tests (Vitest).
- `yarn test:unit` — run unit tests in `src/`.
- `yarn test:integration` — run integration tests in `test/integration/`.
- `yarn test:e2e` — run end‑to‑end tests in `test/e2e/`.
- `yarn test:coverage` — run tests with v8 coverage.
- `yarn test:watch` — watch mode for local dev.

## Coding Style & Naming Conventions

- TypeScript, ESM modules, 2‑space indentation, semicolons.
- Keep import paths using `.js` extensions (TypeScript + ESM output).
- Naming patterns:
  - `*.unit.test.ts` (unit)
  - `*.int.test.ts` (integration)
  - `*.e2e.test.ts` (e2e)

## Testing Guidelines

- Framework: Vitest with v8 coverage.
- Aim for high coverage (90%+). Tests should be meaningful and scenario‑based.
- Use temp directories for filesystem tests and clean up if needed.
- Integration tests should exercise real file/DB/archive flows; keep unit tests small and focused.

## Commit & Pull Request Guidelines

- Commit messages follow `<area>: <summary>` (e.g., `tests: add sqlite pagination cases`).
- Keep commits small and frequent when iterating.
- PRs should include a concise summary, test results, and any doc updates. Link issues when applicable.

## Documentation Notes

- Update `docs/` (and both languages if applicable) when behavior changes.
- Avoid editing `spec.md` unless a spec change is intended.
