# Tests

The suite is Vitest. Most of it runs under one config,
`tests/config/vitest.config.ts`, in jsdom; the rest has its own config because
it needs a real browser or a Firebase emulator.

## Where tests live

The main config runs tests from three homes, and a domain's tests are usually
split across all of them:

- `tests/unit/<domain>/`, for example `tests/unit/create/` or `tests/unit/3d/`;
- loose files in the `tests/unit/` root, an older layout;
- beside their source in `src/`, as `name.test.ts` (matched by glob, so a new
  co-located test runs without being registered).

It also runs `tests/migration/`. Browser component tests (`*.svelte.test.ts`)
sit beside their components in `src/` but run only under the components config.

To find the tests a change touches, use the locator rather than searching:

```sh
npm run test:changed -- --list   # grouped by reason, runs nothing
npm run test:changed             # run them
```

It selects the changed tests, the tests whose import graph reaches a changed
file (`vitest related`), tests whose text names a changed file, the domain's
`tests/unit/<domain>/` folder, and a changed package's own `test` script. A
change to `tests/config/`, `tests/setup/`, dependencies or a root config
selects the whole suite. `npm run wt:finish` runs it for the branch.

Tests that load a workspace package (`@tka/sequence-engine` and the rest of
`packages/*`) get its built `dist`, because the package's `exports` map sends
the `import` condition there, and nothing rebuilds `dist` when the package
sources change. `test:changed` runs `npm run build:packages` before it runs
anything (`--no-build` skips that), and CI builds first too. When a test fails
locally with a missing export from a workspace package, run
`npm run build:packages` and try again.

### Where a new test goes

Beside its source as `name.test.ts`, or in `tests/unit/<domain>/`. Never loose
in the `tests/unit/` root. A contract test that reads source as text names the
full repo-relative path of the file it reads, so the locator's mention scan
finds it.

## Configs

| Config                             | Runs                                                       | Command                                                     |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `vitest.config.ts` (main)          | `tests/unit`, `tests/migration`, `src/**/*.test.ts`, jsdom | `npm test`, `npm run test:ci`, `npm run test:changed`       |
| `vitest.components.config.ts`      | `src/**/*.svelte.{test,spec}.ts` in Chromium               | `npm run test:components`, `test:components:ci`             |
| `vitest.rules.config.ts`           | `tests/integration/firestore-rules`, Firestore emulator    | `npm run test:rules` (manual)                               |
| `vitest.e2e.config.ts`             | `tests/integration/auth-upgrade/*.e2e.test.ts`, emulator   | `npm run test:e2e` (manual)                                 |
| `vitest.render-parity.config.ts`   | `tests/render-parity/render-parity.test.ts` in a browser   | `npm run test:render-parity` (`:capture`, `:compare`)       |
| `vitest.card-mcp-parity.config.ts` | card and QR parity tests in `tests/render-parity/`         | `npm run test:card-mcp-parity`, `test:live-card-png-parity` |
| `vitest.contact-lab.config.ts`     | `tests/experimental/contact-correct/`                      | `npm run test:contact-lab-acceptance`                       |

`vitest.diagnostics.config.ts` runs `tests/tools/` by hand.
`playwright.config.ts` points at `tests/e2e/`, which now holds only snapshots;
Playwright end-to-end tests were removed in 2026-02.

Always pass the config when running a single file
(`npx vitest run --config tests/config/vitest.config.ts <file>`). The bare form
uses a node environment that CI does not; see the testing skill.

Workspace packages under `packages/*` carry their own Vitest configs; run them
with `npm run test:packages` (five packages have a `test` script).

## What gates what

- `npm run wt:finish` runs `check`, the changed-component compile gate,
  `check:tsc`, `specs:check`, `specs:test` and `test:changed` for the branch.
  Documentation-only branches run the spec checks alone.
- GitHub CI (`web-ci.yml`) runs the main suite, the package tests, the
  components config (failures ignored except four QR files), the card parity
  job, the type checks and the build.
- Not run by any gate: the `firebase-functions` Jest suite, the `mcp-server`
  tests, the emulator configs, and folders outside every include glob
  (`tests/opus-*`, `tests/parity`, `tests/performance`, `tests/manual`).

## Layout

- `config/`: the configs above.
- `setup/`: `vitest-setup.ts` (jsdom shims) and `stubs/` for `$app/*` and
  `cloudflare:workers`.
- `helpers/`, `mocks/`, `fixtures/`: shared test support.
- `unit/`, `migration/`, `integration/`, `render-parity/`: suites as above.
