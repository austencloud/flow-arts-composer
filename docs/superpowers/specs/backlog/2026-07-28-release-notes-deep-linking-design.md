---
status: backlog
value: 2
effort: S
remaining: "Verify on Austen's machine: a real release manifest with surface/highlight/anchor/callout through scripts/release.js --confirm (needs serviceAccountKey.json), the Show me hop from the What's New sheet into a live module and its anchor pulse in the full app shell (the container cannot boot Firebase), the unread dot in AccountPopover and the Preferences row with a signed-in account, and the release-aware SW reload toast on a real deploy. Component code, gate, --debt, state semantics and the arrival are implemented and tested."
depends_on: ''
plan_path: ''
tags: []
last_triaged: 2026-11-01
work_state: verification
---

# Release Notes Deep-Linking + Discovery — Design

> ## 2026-11-01 implementation evidence (branch `claude/release-notes-deep-linking`)
>
> All six sections are implemented; the remaining work is live verification
> on Austen's machine (see `remaining`).
>
> **Code.** `ChangelogEntry` in both model copies and the Zod
> `ChangelogEntrySchema` carry `surface`, `highlight`, `anchor`, `callout`
> (malformed or null values degrade to undefined). `toPublicChangelog` keeps
> them and still strips `audience`; `auditChangelogEntries` validates the
> highlight fields; `auditReleaseAnchors` + `collectReleaseAnchors` block a
> highlight whose anchor matches no `data-release-anchor` under `src/`;
> `applyHighlightSelection` writes the flag instead of the parallel
> `highlights` array (release.js no longer writes that array);
> `scripts/release.js --debt` prints `summarizeReleaseDebt` without needing
> credentials. "Show me" is `release-surface.ts` (`resolveShowMeTarget`) +
> `ShowMeButton.svelte`, used by `WhatsNewModal` and
> `EditableChangelogItem`, navigating through `handleModuleChange`. The
> arrival is `release-tour-state.svelte.ts` (pending arrival),
> `ReleaseTourArrival.svelte` (mounted in `MainApplication`),
> `release-anchor-arrival.ts` (waits up to 8 s for the anchor, scrolls,
> focuses) and `attentionPulse` in `shared/transitions/motion.ts` (two
> `DURATION.dramatic` rings; static outline under reduced motion). The
> first anchor is `data-release-anchor="settings-whats-new"` on the
> Preferences "What's new" row. Discovery: `whatsNewState` marks seen only
> when the sheet or the Release Notes page opens, keeps a separate
> `tka-last-toasted-version` mark, exposes `unseenVersions`/`hasUnseen`
> for the reserved-slot dots in `AccountPopover` and `SettingActionRow`
> (Preferences row), and `openRollup` shows every unread release newest
> first with a `v{x}` badge per section. `hooks.client.ts` upgrades the SW
> toast to "TKA v{X} is ready. Reload to see what's new." when the newest
> published release is newer than the running build (single limit-1 read,
> 2.5 s cap, generic copy on any failure). `/release` and `/queue` skills
> and `changelog-policy.md` reference the new fields and `--debt`.
>
> **Product calls made without Austen.** The callout reuses the toast owner
> (`showToast`, polite, 10 s) rather than a new content-anchored callout
> primitive; grep found no existing dismissible inline callout and the rule
> is to reuse before building. The spec's em-dash copy for the SW toast was
> written as two sentences per `docs/reference/ai-writing-guide.md`. The
> release-tour state is a factory with one exported app instance (like
> `whatsNewState`), not module-root context, because the arrival outlives
> the settings surface that sets it.
>
> **Verified here.** Vitest: `tests/unit/release-module-gate.test.ts` (57,
> gate, anchors, highlight selection, debt), `tests/unit/feedback/
> app-version-entry-surface.test.ts`, `select-unseen-versions.test.ts`,
> `src/lib/shared/versioning/domain/utils/release-surface.test.ts`,
> `src/lib/shared/settings/state/whats-new-state.test.ts` (seen only on
> open, toasted mark separate, rollup). Scoped `svelte-check` over the
> touched files: no errors in them (the 81 reported are pre-existing in
> unrelated 3D/maps files pulled in through imports). Playwright, headless
> Chromium on `/test/release-tour` at 375×667 and 1440×900, each with and
> without `prefers-reduced-motion`: Show me renders only for the
> guest-reachable surfaced entry (hidden for account-only, global, unknown
> module, no surface); the arrival scrolls the anchor into view, focuses it
> (`tabindex=-1`), runs the pulse animation (static `outline: solid` under
> reduced motion, instant scroll) and removes it afterwards; a missing
> anchor shows the callout toast; the catch-up sheet shows two releases with
> badges and no horizontal overflow at both widths.
>
> **Not verifiable in the container.** The full app shell stalls on
> "Almost there" without Firebase config, so the real Show me hop into a
> live module, the dots with a signed-in account, and the SW toast were not
> exercised end to end.

> 2026-10-14 triage: Implement release entry metadata retention, validated Show me navigation/arrival state, unread discovery/rollup, release-aware reload copy and release-debt reporting. toPublicChangelog still strips entries to category/text (scripts/lib/release-module-gate.mjs:610–612), and release-tour/data-release-anchor are absent; 24a63db357 only changes rich-text rendering. Earlier status banners and execution instructions are historical where they conflict with this review.

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
