---
status: backlog
value: 2
effort: S
remaining: Current source has no release-tour or data-release-anchor usage; implement entry anchors and release-tour state, then verify deep links.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: ready
---

# Release Notes Deep-Linking + Discovery — Design

**Date:** 2026-07-28
**Status:** Approved (brainstormed with Austen)

## Problem

Release notes are written well but go nowhere and are easy to miss entirely:

1. **No linkage.** A changelog entry describing a feature cannot take the user
   to that feature. The release pipeline already forces authors to declare
   `surface: "global" | {module, tab}` per entry (`release-module-gate.mjs`),
   then `toPublicChangelog()` strips it before the entry reaches Firestore.
   The deep-link data is authored on every release and thrown away at the door.
2. **One-shot discovery.** The only proactive signal is a single 10-second
   toast per version, marked "seen" the moment it fires. Miss it and nothing
   in the app ever hints again. No badge, no dot, no rollup across skipped
   versions.
3. **Two unrelated "something updated" prompts.** The service-worker reload
   toast and the What's New toast share no language and can fire back to back.

## Decisions (made during brainstorm)

- **Tiered deep-linking (option C):** plain "Show me" navigation for every
  entry with a surface; full hand-holding (anchor pulse or callout) reserved
  for highlights. Entries with `surface: "global"` or no surface render no
  affordance — no dead buttons.
- **Discovery (option B):** keep the once-per-version toast; add a persistent
  unread dot; mark "seen" only on actual open, not on toast-fire.
- **"Show me" lives in both surfaces** — the What's New modal and the
  Release Notes tab. Old notes stay navigable forever, degrading gracefully.
- **No push gate.** Deploy continuously, release intentionally. A release-debt
  report makes un-noted work visible; it never blocks a push.
- **The SW reload prompt always fires** on every deploy. Only its copy
  upgrades when a release exists.
- **Forward-only.** No backfill of old `versions` docs; they render as today.

## 1. Schema

`ChangelogEntry` (both copies today — `src/lib/shared/versioning/domain/models/version-models.ts`
is the one the UI imports; the `feedback` copy is a known duplicate) gains
optional fields:

```ts
interface ChangelogEntry {
  category: "fixed" | "added" | "improved";
  text: string;
  feedbackId?: string;
  contributorIds?: string[];
  // new:
  surface?: { module: string; tab?: string } | "global"; // no longer stripped
  highlight?: boolean;   // replaces the parallel highlights: string[] array
  anchor?: string;       // highlight-only: matches a data-release-anchor in DOM
  callout?: string;      // highlight-only: one-sentence arrival welcome
}
```

- `toPublicChangelog()` in `scripts/lib/release-module-gate.mjs` keeps
  `surface` (and the new fields) instead of stripping to `{category, text}`.
  `audience` remains authoring-only and is still stripped.
- New gate check: a highlight declaring an `anchor` must grep-match a
  `data-release-anchor="<value>"` attribute under `src/`, or the release
  blocks with a clear error.
- Zod schema (`feedback-schemas.ts` `AppVersionSchema`) extended to match;
  unknown/absent fields on legacy docs coerce to `undefined` as today.
- Legacy `AppVersion.highlights: string[]` still renders for old docs. New
  releases set `highlight: true` on entries instead — a highlight IS an
  entry, no duplicated text. The release script's highlight picker writes the
  flag rather than the parallel array.

## 2. "Show me" navigation (every surfaced entry)

One shared piece colocated with the versioning components, consumed by both
`WhatsNewModal.svelte` and the Release Notes tab components
(`ChangeGroupSection.svelte` / `VersionDetailContent.svelte`):

- Given `surface: {module, tab}`, renders a "Show me" button (styled per the
  design system — a real button, not a text link).
- Click: close the modal / leave Settings, navigate via the existing
  `handleModuleChange` path (same mechanism the modal's "All Releases" button
  uses today). No new navigation machinery.
- Render-time validation against the tab registry
  (`tab-definitions.ts` / module registry): module or tab missing, or not
  accessible to the current user (guest vs account) → button does not render.
- `surface: "global"`, absent surface, or failed validation → plain entry.
  Old notes therefore stay navigable forever and rot silently, never visibly.

## 3. Highlight arrival: anchor pulse or callout

A small `release-tour` state (factory + context pattern, per
state-management conventions) holds at most one pending arrival:
`{ anchor?: string; callout?: string }`, set when a highlight's "Show me" is
clicked.

On arrival (target tab mounted):

1. `anchor` present and `[data-release-anchor="<anchor>"]` found → scroll into
   view + soft pulse ring. Reduced motion collapses to a static outline.
   Duration via `DURATION.*` tokens; no bespoke animation system.
2. Anchor absent or rotted → fall back to `callout` if present.
3. `callout` → one dismissible line anchored to the tab's content area,
   author-written plain language (jargon rules apply — it ships through the
   same pipeline). Dismiss = cleared, never re-shows. Reuse the closest
   existing dismissible-callout primitive; grep before building
   (`never-hand-roll.md`).
4. Neither → arriving at the right tab is the whole experience.

Per-release authoring cost: one `data-release-anchor` attribute on the target
element for anchored highlights, verified by the gate.

## 4. Discovery: the dot carries the memory

- **Toast:** unchanged. Once per version, 10s, "See what's new" action.
- **Seen semantics change:** `whats-new-state.svelte.ts` marks the version
  seen only when the What's New modal or the Release Notes tab is actually
  opened — no longer on toast-fire. The toast still never re-fires for the
  same version (separate "toasted" high-water-mark, localStorage is fine —
  worst case after a device switch is one extra polite toast).
- **Unread dot** while any version is unseen:
  - on the version number in `AccountPopover.svelte`
  - on the Release Notes entry in the Settings sidebar (tab-definitions
    badge seam if one exists; otherwise the settings nav item renders it)
  - Space reserved; `visibility` toggle, not `display` (`no-layout-shift.md`).
- **Rollup:** the What's New modal aggregates ALL versions between last-seen
  and current (high-water-mark comparison already exists), newest first, each
  section badged `v{x.y.z}`. A user who skipped four releases catches up in
  one modal. Opening it marks everything up to current as seen.

## 5. One update voice (SW toast copy)

`hooks.client.ts` SW-update path, on update-ready:

- Fetch the latest `versions` doc (single doc read, newest by semver).
- If its version > running `__APP_VERSION__`: toast reads
  "TKA v{X} is ready — reload to see what's new."
- Else (un-released deploy) or on any fetch failure: today's generic
  "A new version is available." — the reload action never depends on the
  network call succeeding.
- After a release-aware reload, the normal What's New toast/modal flow takes
  over. That is the sequel the reload copy promised — not a second unrelated
  prompt.

## 6. Release debt: visible, never blocking

`scripts/release.js --debt`:

- Commits since last tag; how many classify as user-facing via the existing
  module classifier in `release-module-gate.mjs`; days since last release.
- Output is a short human-readable report ending in a plain verdict, e.g.
  "23 user-facing commits over 9 days — worth cutting a release."
- `/release` and `/queue` skills reference it so any session can answer
  "is it time to release?" No hook, no gate, nothing blocks a push.

## Out of scope

- Backfilling `surface` onto historical `versions` docs.
- Consolidating the duplicate `feedback` vs `versioning` model layers
  (known cleanup, separate task — this design touches the `versioning` copy
  the UI imports and keeps the Zod schema in `feedback-schemas.ts` aligned).
- Auto-opening the What's New modal (rejected — toast + dot stays polite).
- Any change to SW registration/activation mechanics.

## Testing

- Unit: gate keeps `surface`/new fields and strips `audience`; anchor
  grep-check blocks a bad anchor; Zod accepts legacy docs (null/absent new
  fields); rollup selects the right version range; seen-marking only on open.
- Component (test-on-fix discipline — lean): "Show me" renders only for
  valid, accessible surfaces; dot toggles without layout shift.
- Visual: screenshot pass over modal + Release Notes tab + a pulse/callout
  arrival at the required viewports (`visual-verification-mandatory.md`).

## Rollout

1. Schema + gate + script (highlight flag, anchor check, `--debt`).
2. "Show me" in both surfaces + release-tour state + pulse/callout.
3. Discovery changes (seen semantics, dot, rollup).
4. SW toast copy.

Each step ships independently; nothing user-visible breaks if later steps
lag — new fields are simply unused until the UI reads them.
