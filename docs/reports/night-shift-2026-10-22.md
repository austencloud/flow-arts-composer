# Night shift, 2026-10-22

Austen asked for an autonomous overnight pass on the highest-value work across Flow Arts Composer. This is what landed, how it was verified, and what still needs a human. Everything is on local `main` in `C:/tka-platform`; nothing was pushed, and no Firestore rules or functions were deployed.

## Where the picks came from

- Local `main` on this laptop was 1,476 commits behind `origin/main` (last local merge 2026-10-08). It was merged first (`b98badf9da`, no conflicts) so every fix is built on the 2026-10-21 release. Three gallery prefetch commits that only ever existed on this machine (`4af26e0235`, `50076894a1`, `d82e9584cb`) rode along; they address the thumbnail render timeouts PostHog still shows on 2026-10-21 and 22.
- PostHog exceptions and session replays for the last 14 days, read through the API, ranked the real problems: a crash entering Shape Engine from the Create front door (real iPhone and Android users on 2026-10-21), a guest on Browse getting eleven permission errors in one burst (2026-10-22), two users unable to publish, and a generator giving up after 40 retries. The loud `getBBox` and SVG-load errors on the guide pages turned out to be crawler traffic from Singapore and China datacentres, not people.
- The spec queue (18 ready, 102 held) and the feedback queue (30 new) supplied the smaller items. "Translate the entire app" was the one lever Austen named outright.

## What landed on local main

In merge order. Each branch was reviewed here, its tests rerun in its own worktree, and then merged.

### i18n structure validator (f2ca27d613)

Every commit on main was refused by the pre-commit hook: `scripts/validate-i18n-structure.cjs` derived `tab_browse_*` and `tab_desc_browse_*` keys for the six Browse tabs added in d80066713c, which use explicit `labelKey`/`descKey` (`browse_home_*`) instead. The validator now honours explicit keys and falls back to the derived names only for tabs without them. A deliberately wrong `labelKey` still fails the check. This had to land first; every implementer session hit it.

### Browse guest and publish permissions (merge ab52f6569a)

- `70dd963628` `ensureGuestIdentity` now awaits `auth.authStateReady()` before deciding whether to create a guest. On a fresh page load it read `currentUser` before Firebase Auth had restored the saved session, and `signInAnonymously` replaced the restoring identity with a new anonymous user in every tab; the listeners already running for the first identity were then denied. That is the eleven-error burst in session `01a161f9` and matches the earlier watching items ISS-015 and ISS-016.
- `2ee4a26ef8` Publishing a library copy of someone else's gallery sequence (the copy keeps the original id) found the publisher's mirror and claim and committed writes the rules correctly deny. The persister now stops before writing with `PublicSequenceOwnedElsewhereError`, a `PublicDuplicateError` subtype, so the sheet shows the existing "already in the gallery" handling (feedback `el3e6MqX1v4cFiEi2lF8`, `Fsa9S58a9tIhALmALXxu`; both reported sequences are public entries owned by another account). No rules change.
- Verified: 35 unit tests in the branch worktree. The new parity rules test `tests/integration/firestore-rules/public-sequence-parity.rules.test.ts` is unrun on this machine (no Java for the emulator).

### Generator (merge 1e95032881)

- `a8acdad95a` "[Auto] Sequence generation failed" (feedback `8xoqFsFJel2msrKCY2u5`): the request was genuinely unsatisfiable. SS prop timing forces every beat to be a shift on both hands or a static on both, no-dash removes dashes, and level 1 refuses statics, so every beat is a double shift and a 4-step seed can never land the quarter a quartered rotation needs. The reachability graph still contained level 1 statics, so the builder believed the request was feasible and the beam died at step 4 forty times. Level 1 now drops Type 6 beats from the graph, infeasible LOOP seeds throw `GenerationInfeasibleError` naming the settings that would open a path, the 40-attempt reroll stops immediately on it, and the Generate panel shows a notice ("No 16-step rotated LOOP fits these settings together. To open a path, try one of these: allow dashes, choose a prop relationship other than SS, or choose level 2 or higher.") instead of filing a bug report.
- `01d03f408d` Level 2 with max turn intensity 1 producing no turns (feedback `X9hMiHdgWrjR8sh1qCIA`, 2026-09-05) does not reproduce on main; it was fixed on 2026-09-09 by `e53209c579`, which removed the persisted turn pattern that overrode Level. Seven regression tests pin it, including a stale level 1 pattern restored from localStorage.
- Verified: `packages/sequence-engine` 854 tests and `tests/unit/services` plus loop and create suites, 1,294 tests, in the branch worktree.

### Public-page error noise (merge cfecb73a3c)

`GlyphRenderer` and `pictograph-to-svg` now go through `measureSvgBox`, which returns null when `getBBox` is missing or throws, so renderers without SVG layout no longer produce an exception per glyph (165 events from 25 crawler ids in 14 days). The SVG loaders name the failing source in their rejection instead of a bare message, the `[Canvas2DImageLoader]` console error is gone, and `app.html`'s global handlers format error objects so `[object Object]` never reaches PostHog again. 15 new jsdom tests plus 179 neighbouring tests. Nothing a real browser renders changes.

### Shape Engine crash (merge 831067e03f)

`ShapeMatrixAppShell.svelte`'s focus-motion `$effect.pre` read `focusMode`, a `$derived` that `9fe687a961` (2026-10-14) had moved below it. When the tab mounts during a client-side navigation Svelte runs the pre-effect during setup, so the read landed in the temporal dead zone and production threw `Cannot access 'z' before initialization`. It was not an import cycle. The effect now sits below the derived. Reproduced and cleared against a production build served through Wrangler on the exact click path (`/create`, then the Shape Engine card), plus direct loads of `/create/shape-engine` and `/shape-engine`.

### Translations (merge 87df9cc7da)

Every released-prefix key now exists in all ten locales: de 128, es 153, fr 154, it 154, pt 152, ja 3,499, ru 3,499, ko 3,558, zh 8,280, ar 8,280 strings added, 27,857 in total, one commit per locale. `en.json` is untouched, no unreleased-prefix key was translated, and no existing translation was rewritten. Checked by the structure validator, the 83 i18n unit tests, and an independent placeholder and markup parity pass across all ten files. Register follows `docs/reference/i18n-glossary.md` (du, tu, lowercase вы, 你), which the existing catalogs already use.

### Remaining pre-effect hazards and a repo-wide guard (merges 64bf3ae10e, b1c7044760)

The Shape Engine session scanned every component for the same bug class and found two more: `PostShareSheet.svelte` read `qrDataUrl` and `CustomizeExpandedOverlay.svelte` wrote `resetConfirmOpen` from a pre-effect before their declarations. Neither can throw on today's first mount (the read is gated on file preparation being open; the write is gated on a transition that cannot happen during setup), but both would the moment those gates changed. Their declarations moved up. `tests/unit/svelte/pre-effect-declaration-order.test.ts` now parses every `.svelte` file under `src/` with the Svelte compiler and fails on any top-level pre-effect that reads or writes a later top-level binding, following called functions and skipping scheduler callbacks. It is the single owner of the rule; the directory-scoped copy that shipped with the crash fix was retired.

### Account settings and the Create heading (merge bd158b9656)

- `20a1a7a468` The Sign-in methods list shows "Connect Google", "Connect Facebook" and "Connect Instagram" as the visible label (the existing `nav_provider_connect` key, already translated), and the accessible name is the visible text. The action column grows to fit the longer labels. A browser component test covers the provider state matrix at 343 px and 640 px: the buttons measure 129x44, 145x44 and 150x44 CSS px and nothing overflows.
- `350de08f8a` The "How do you want to create?" heading is centered above the creation-method cards (feedback `VfiRZDezfMd7ahRwsMvc`). Measured heading centre against card-grid centre at 375x667, 707x823, 884x1104, 1440x900 and 3840x2160: equal within 0.01 px, no horizontal overflow.
- `c8a3e3e3cd` The account-settings spec records the label fix and stays `in-progress`: criteria 12 to 16 (page-level geometry, focus order, contrast) need a signed-in Settings page, which the task server could not reach without the agent password.

## Gates on the merged tree

Run in a fresh worktree of the final `main` (`bd158b9656`), never in the primary checkout:

- `npm run check`: 321 files, 0 errors, 0 warnings.
- Targeted vitest over everything touched tonight: 198 files and 1,608 tests on `87df9cc7da`, then 77 files and 638 tests (svelte guard, auth, onboarding, shape-matrix, generate cards) on `bd158b9656`. All green, 2 expected failures as designed.
- The full unit suite was not run here; the pre-push hook runs it on push.

## What needs you

1. **Publish.** `node scripts/push-public.mjs` builds the snapshot commit and runs the private check; `--push` after your review (the rule from 2026-10-19). The Shape Engine crash and the guest permission burst are live on production until then.
2. **Run the rules test somewhere with Java:** `npm run test:rules:parity` (the new case pins the denial and the owner's identical republish).
3. **Review the translations you care about.** Korean and Arabic had no termbase to anchor to, and Chinese mixes 步 and 步骤 for step. The per-batch list of uncertain terms is in `%APPDATA%\Claude\side-session-notes\local_8791bfd2-a4ea-4dc3-af2a-012cbb8c513e\i18n-unsure-terms.md`. Admin-only `tab_*` labels (Hall of Shame and friends) were translated because `tab` is a released prefix.
4. **Product call:** a saved copy of someone else's gallery sequence cannot be published under the shared id. Giving copies their own id would allow it.
5. **Close the feedback items** that are fixed: `8xoqFsFJ`, `el3e6MqX`, `Fsa9S58a` (publish), `VfiRZDez` (heading), and `X9hMiHdg` (already fixed in September). The browse permission items ISS-015/ISS-016 (`LtECGuEz`, `VUKTL8YA`) should be watched after deploy.
6. **Account settings acceptance** (criteria 12 to 16) still needs a signed-in pass.

## Machine notes

- Two September app worktrees (`amazing-haibt-4ba528`, `gifted-jepsen-a6b801`) had `node_modules` as a junction into the primary checkout. Sessions ran `pnpm install` there, which rewrote the primary's dependency links to route through the worktree. The primary was reinstalled cleanly (`CI=true pnpm install`), the two junction links were removed, and `:5173` answered in under 100 ms afterwards. The generated `node_modules/$app` folder, which worktree test runs resolve through the primary, was restored.
- Session and agent worktrees are left in place under `.claude/worktrees/` (their branches are merged): `amazing-haibt-4ba528`, `gifted-jepsen-a6b801`, `generator-rotated-loop-failure-2fd87b`, `i18n-coverage-fill-e58a36`, `agent-ae3a58bf8b9ff1a05`, `agent-a9b445c83ed3c2ad9`, `agent-ae21eab306abe71d1`, `final-gate`.
- Two new memory notes record the junction hazard and the coordinator mechanics (session trust prompts, the Agent tool fallback, the pre-commit validator, the Bash backslash quirk).
