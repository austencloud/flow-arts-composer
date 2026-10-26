---
name: testing
description: Use when writing, reviewing, or deciding whether to write tests in this project. Enforces the "silent bug" philosophy — test what eyes can't catch, skip what's obvious when broken.
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Testing Philosophy

**Core principle:** Tests exist to catch silent bugs — things that would produce wrong output without anyone noticing.

## The "Silent Bug" Test

Ask: _"If this breaks, will I notice immediately, or will it silently produce wrong output?"_

Test the silent ones. Skip the obvious ones.

## When to Write Tests

| Scenario                           | Test? | Why                                  |
| ---------------------------------- | ----- | ------------------------------------ |
| Pure algorithm/calculation         | Yes   | Math is stable, bugs are subtle      |
| Silent data corruption risk        | Yes   | You won't notice until it's too late |
| Data transformation pipelines      | Yes   | Wrong output looks plausible         |
| Bug that regressed before          | Yes   | Proven problem worth preventing      |
| Complex state transitions          | Yes   | Edge cases are invisible             |
| Serialization/deserialization      | Yes   | Round-trip bugs are silent           |
| UI component rendering             | No    | You'll see if it's broken            |
| Glue code / wiring                 | No    | Obvious when broken                  |
| Something you'd notice immediately | No    | Your eyes are the test               |

## What Makes a Test Valuable

Good: catches a bug that would otherwise reach production unnoticed. Tests specific behavior with a clear assertion. Would fail if the code broke meaningfully.

Bad: confirms a component renders without crashing. Mocks so heavily it tests the mocks. Asserts implementation details. Would still pass if core logic was wrong.

## Where tests live and how to find yours

The main config (`tests/config/vitest.config.ts`) runs tests from three homes:

- `tests/unit/<domain>/`, for example `tests/unit/create/` or `tests/unit/3d/`;
- loose files in the `tests/unit/` root, an older layout;
- beside their source in `src/`, as `name.test.ts`.

A domain's tests are usually split across all three, so do not search one
place. Ask the locator instead:

```sh
npm run test:changed -- --list   # what your change touches, grouped by reason
npm run test:changed             # run exactly those
```

It unions the changed tests, Vitest's import graph (`vitest related`), tests
whose text names a changed file, the domain's `tests/unit/<domain>/` folder,
and a changed package's own `test` script. Config, setup and dependency
changes select the whole suite. `wt:finish` runs it for the branch, so a
failure here is a failure there.

Going forward, put a new unit test beside its source as `name.test.ts` or in
`tests/unit/<domain>/`, never loose in the `tests/unit/` root. A contract test
that reads source as text must name the full repo-relative path of the file it
reads (`src/lib/shared/3d/state/adaptive-quality-state.svelte.ts`, not a
directory walk or a bare name), so the locator's mention scan finds it.

## Always pass the config when running one file

`npm test` resolves to `vitest --config tests/config/vitest.config.ts`, which
sets `environment: "jsdom"` — the same environment CI uses. Invoking vitest
directly on a single file does **not** inherit that:

```sh
npx vitest run path/to/thing.test.ts                               # ❌ node env — CI does not run this
npx vitest run --config tests/config/vitest.config.ts path/to/…    # ✅ matches CI
```

The bare form silently picks up the default config and a node environment, so a
test can pass locally and fail in CI on anything the two environments disagree
about. jsdom is the more limited of the two: its `Blob` predates
`Blob.prototype.arrayBuffer`, its canvas and `ImageData` are shimmed in
`tests/setup/vitest-setup.ts`, and node globals present under `node` may be
absent under jsdom.

If a test passes for you and fails in CI, check which config you ran before
you debug the test.

Stop after the focused tests covering the changed silent behavior pass. Broaden
only when the change crosses project-wide boundaries or a failure supplies a
concrete new risk.
