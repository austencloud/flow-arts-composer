# Selective left/right port, 2026-10-14

## Scope and source evidence

Observation: initial `git status --short` returned no lines; branch was
`codex/swarm-leftright-port`, starting HEAD
`53ffc1da25be5710e9c0715bb0641101125ca039`.
Read `docs/reports/swarm-2026-10-14/proto-relevance.md` before source changes.
Inspected `git diff main...codex/left-right-rock-solid --` for the two components
and bootstrap test, and `git show codex/left-right-rock-solid:tests/unit/prop-studio-lightweight-bootstrap.test.ts`.
The source tip supplied by the brief is `5ae8d33578`.
No merge, cherry-pick, checkout, push, install, server, full check, or build ran.
All writes are confined to the brief's owned paths.

## Piece 1: neutral prop preview

Disposition: **ported** the explicit `useSavedOverrides={false}` flag in
`src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte`.
Ported the bootstrap regression assertion into
`tests/unit/prop-studio-lightweight-bootstrap.test.ts`, strengthened to require
the flag on the neutral preview invocation.

Observation: `PropCompositionPreview.svelte` documents `neutral` as a single
white silhouette. Its neutral render branch uses `leftArt`, which can otherwise
resolve saved artwork; `onMount` loads application settings unless
`useSavedOverrides` is false. Disabling saved overrides keeps canonical artwork
and prevents that dynamic application-state import. The preview component itself
needed no modification.

Observation: inspected `git show` for these later commits:

- `430fa0d007`: adds single-hand rendering inside the `pairedGlyph` branch;
  keeps the separate neutral branch.
- `cab0028b30`: applies saved hand colors to paired/tile artwork; its source
  fetch effect explicitly chooses no recolorable artwork for `neutral`.
- `09a3d4f337`: derives the right prop from the current prop so a size change
  redraws both hands; does not change the neutral contract.

Observation: today's `PropGridPreview.svelte` passes `pairedGlyph={!neutral}`,
explicit colors and appearance, and already sets `useSavedOverrides={false}`.
`PropChiralityRow.svelte` also uses paired glyphs with explicit overrides.
`PresetChip.svelte` and `PrimaryPropColorSettings.svelte` use paired glyphs.
`rg -n '<PropTypeButton|import PropTypeButton' src` returned no matches (exit 1).

Inference: the active picker's user-selected colors/builds remain intentional.
The older neutral leaf button is consistent with canonical catalog artwork;
the flag does not alter those active picker callers. No reachable current
screen containing `PropTypeButton` was established, so this is a latent contract
repair rather than a reproduced user-visible defect.

LOOK CHECK — not performed: no dev server or alternate surface was created.
For the coordinator's integrated app, open Settings → Props and change saved
hand colors and fan builds: paired picker previews should still follow those
choices. If a review harness already mounts `PropTypeButton`, inspect that
button: one canonical white silhouette should remain after saved appearance and
recipe changes; mounting it alone should not request application settings.
There is no established live route for this leaf button in today's source.

## Piece 2: delayed grid reset

Disposition: **ported with current timing preserved** in
`src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`.
The panel owns one `PlacementResetTimer` from the adjacent new
`placement-reset-timer.ts`. Every grid selection cancels pending work before
either scheduling a delayed reset or applying an immediate change. The existing
`onMount` cleanup cancels the timer on unmount. Scheduling also replaces any
previous callback, and completed timers release their handle before invoking it.

Observation: `git show 45390a6492 -- src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`
changes toast constants and CSS transitions but leaves the 150 ms reset delay
untouched. Today's source still uses 150 ms with its animation-midpoint comment.
The historical branch uses `DURATION.emphasis / 2`; this port retains today's
literal 150 ms and makes no CSS or motion-token changes.

Observation: capability search used `timer`, `debounce`, `timeout`,
`clearTimeout`, and timer declarations in the canonical capability index,
shared utilities, and Generate. The closest shared implementation,
`src/lib/shared/utils/debounce.ts`, cannot expose cancellation on unmount.
Nearby `LOOPExpandedOverlay.svelte` owns its own close timer. No reusable
cancellable placement-reset owner was established.

Inference/decision: isolate only the existing panel's timer in a small class
beside its consumer for focused fake-timer tests. It is instantiated per panel;
a shared singleton would let one panel's cleanup cancel another panel's work.
No shared utility or service API was added outside the owned paths.

Observation: `tests/unit/placement-reset-timer.test.ts` tests the unchanged
150 ms boundary, latest-selection replacement, cancellation and repeated
cancellation, and independence between panel lifetimes. It does not mount the
whole container; browser wiring and animation appearance remain unverified.

LOOK CHECK — not performed: in Create → Generate, choose start/end placements,
switch grid modes twice within 150 ms, then wait. Only the final mode should be
applied. Repeat while clearing placements before the next mode selection, so
the immediate path cannot later be overwritten by an earlier callback. Switch
modes with placements and immediately leave Generate; returning should not show
a reset from the unmounted panel. Check normal and reduced-motion settings;
the port deliberately preserves the current delay for both.

## Verification

Observation: commands run in this worktree:

```text
npx vitest run --config tests/config/vitest.config.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/placement-reset-timer.test.ts
Test Files  2 passed (2)
Tests  12 passed (12)
Duration  3.44s

npx eslint src/lib/features/create/generate/components/placement-reset-timer.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/placement-reset-timer.test.ts
Exit 0; 0 errors, 2 warnings: both test files ignored by the repository's matching ignore pattern.

npx eslint --no-ignore src/lib/features/create/generate/components/placement-reset-timer.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/placement-reset-timer.test.ts
Exit 1; 2 parsing errors, 0 warnings: each test file "was not found in any of the provided project(s)" for parserOptions.project.

npx prettier --check src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte src/lib/features/create/generate/components/placement-reset-timer.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/placement-reset-timer.test.ts
Checking formatting...
All matched files use Prettier code style!

node --input-type=module -e "import { readFileSync } from 'node:fs'; import { compile } from 'svelte/compiler'; for (const filename of process.argv.slice(1)) { compile(readFileSync(filename, 'utf8'), { filename, generate: 'client' }); console.log('PASS ' + filename); }" src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte
PASS src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte
PASS src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte

npx prettier --check src/lib/shared/settings/components/tabs/prop-type/PropTypeButton.svelte src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte src/lib/features/create/generate/components/placement-reset-timer.ts tests/unit/prop-studio-lightweight-bootstrap.test.ts tests/unit/placement-reset-timer.test.ts docs/reports/swarm-2026-10-14/leftright-port.md
Checking formatting...
All matched files use Prettier code style!

git diff --check
Exit 0, no output.
```

Observation: browser checks and full type checks were not run. The brief forbids
a dev server, full checks, and touching other worktrees. Delivery is committed
work for the coordinator; integration and visual review remain with that session.
No product decisions or approvals are required from Austen.

Observation: the required ESLint invocation passes, but ignores tests. Attempting
to include them reveals the existing lint project boundary; no lint configuration
was changed because it is outside owned paths. The helper produced no lint errors.
Proposal: if the coordinator wants typed ESLint coverage for unit tests, provide
a test-inclusive ESLint TypeScript project in a separately scoped task.
