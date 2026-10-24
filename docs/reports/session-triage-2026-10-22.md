# Session triage, 2026-10-22

Read-only pass over PostHog production sessions since the register watermark
(`reviewedThrough` 2026-08-31T20:14:27Z). Nothing was written to PostHog or
Firestore. The register writes this run would have made are listed at the end
for someone to apply with Austen's yes.

## How the data was read

- `triage-sessions.ts analyze --since 2026-08-31T20:14:27Z --limit 40 --json`.
  The query caps at the 200 newest sessions, so the friction ranking covers
  roughly 2026-10-15 to 2026-10-22. Exceptions were aggregated across the full
  window with direct HogQL reads (same `pulseProdFilter()` exclusions).
- PostHog's web SDK leaves `$exception_message` empty. Every exception since
  July carries its text only in `$exception_values`. The triage session view
  therefore printed every exception as a blank line. Fixed in this run (fix 1).
- **Most exception volume is crawler traffic.** The guide-page exceptions
  (rows C1 to C3) all come from `zh-CN` Chrome on cloud IP ranges: 112 device
  ids, 112 sessions, 118 page views since 10-15, never identified, one page
  per session. They are not people. They fill 30 of the top 40 friction slots.

## Exceptions, ranked by distinct real users

| #   | Message                                                                                             | Route                              | Code site                                                                                          | Users                       | Sessions | First / last         | Register match                            | Verdict                                              |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- | -------- | -------------------- | ----------------------------------------- | ---------------------------------------------------- |
| E1  | `Cannot access 'z'/'R' before initialization`                                                       | /create/shape-engine               | `src/lib/shared/shape-matrix/app/components/ShapeMatrixAppShell.svelte` (focus-mode `$effect.pre`) | 5                           | 6        | 10-16 / 10-22 08:05Z | none (new)                                | Fixed upstream today, published                      |
| E2  | Firestore `Missing or insufficient permissions` (listeners and saved-art lists right after sign-in) | /browse, /browse/explore/sequences | `src/lib/shared/auth/services/guest-identity.ts:63`                                                | 1 (10-22)                   | 1        | 10-22 / 10-22        | ISS-001 by route? No: pinned site, so new | Fixed upstream today, published                      |
| E3  | `PublishPermissionError` on every app open                                                          | /create                            | `src/lib/shared/library/services/library-repository.ts:748` via `public-sequence-persister.ts:400` | 1 (tester "Sky Guys Quest") | 6        | 10-16 / 10-20        | none (new)                                | needs-design                                         |
| E4  | `Worker N init timeout` (all 6 to 7 workers at once)                                                | /shop, /shop/starter-pack          | `src/lib/shared/render/services/composition-dispatcher.ts:620`                                     | 2                           | 2        | 10-20 / 10-21        | ISS-009 (resolved) → reopen               | needs-investigation                                  |
| E5  | `Thumbnail render exceeded 15000ms`                                                                 | /browse/explore/sequences          | `src/lib/shared/browse/services/thumbnail-render-queue.ts:48`                                      | 1                           | 1        | 10-21 / 10-21        | ISS-010 (open) → recurrence               | needs-investigation                                  |
| E6  | `$state is not defined` in `environment-renderer.worker`                                            | /composer                          | not found in current static graph (see below)                                                      | 2                           | 3        | 10-15 / 10-16        | none                                      | watching                                             |
| E7  | `auth/requests-from-referer-<empty>-are-blocked`                                                    | /browse/explore/sequences          | Firebase API key referrer rule (config, not code)                                                  | 4                           | 4        | 10-01 / 10-01        | none                                      | watching (one day only)                              |
| E8  | `Cannot read properties of undefined (reading 'isReady')`                                           | /sequence/d1:…                     | not found (chunk not source-mapped)                                                                | 1                           | 1        | 10-19                | none                                      | watching                                             |
| C1  | `a.getBBox is not a function` / `o.getBBox …`                                                       | localized /guide pages             | `src/lib/shared/animation-engine/components/GlyphRenderer.svelte`                                  | 21+ crawler ids, 0 people   | 26       | 10-18 / 10-22        | none                                      | Fixed upstream today (`measureSvgBox`), crawler only |
| C2  | `Failed to load SVG image` / `[Canvas2DImageLoader] Image load error`                               | localized /guide pages             | `src/lib/shared/animation-engine/services/canvas2d/canvas-2d-image-loader.ts`                      | 8 crawler ids               | 8        | 10-18 / 10-22        | ISS-013 (resolved) by code site           | crawler only, no action                              |
| C3  | `Failed to load SVG as image`                                                                       | localized /guide pages             | `src/lib/shared/render/services/svg-image-cache.ts`                                                | 7 crawler ids               | 7        | 10-18 / 10-22        | none                                      | crawler only, no action                              |

Older single-user items (September `Sequence not found`, `PublicDuplicateError`,
`effect_update_depth_exceeded`, offline `Failed to get document`) have not
recurred since September and are left out.

### Details

**E1, Shape Engine crashes on open (clear-cut, already fixed).** Repro on the
10-21 build: open /create, pick "Shape Engine". The `$effect.pre` that animates
focus mode read `focusMode` above its declaration; mounted during client
navigation, Svelte runs it during setup and throws. One user reloaded twice and
left via "Go Home" (session `01a15f61-97f7-7c98-8a0b-b433b2921cdf`). Commit
`d496066396` moved the effect below `focusMode` and the tree is in GitHub
`main` (`f1c5425605`). Last sighting 10-22 08:05Z predates that publish. No
regression test exists; one would need a mount-during-navigation component test.

**E2, signing in on Browse signed the account out (clear-cut, already fixed).**
Session `01a161f9-0970-74f9-9561-bb3d845716ea`: a new account signs in, Browse
mounts, `ensureGuestIdentity` replaces the account with an anonymous guest
(`guest_identity_created`), and the four saved-art loads
(`users/{id}/mandala-collection`, `film-collection`, `scene-3d-collection`,
`tunnel-collection`), `create-public-profile` and `get-private-profile` are all
refused. `guest-identity.ts` now waits for `auth.authStateReady()` before
deciding (comment cites this exact 10-22 page load). Published.

**E3, a tester's publish is refused on every app open (needs-design).** User
`40ovmSoxdR…` ("Sky Guys Quest", role tester). A read of their public
sequences found ids whose public copy or content claim belongs to Austen's
admin account `PBp3…`: `seq_1791923102683_sysj46042` (public doc owned by
`PBp3…`), `seq_1792520228993_5vt91jxo6` "HHHH" and `FH2C` (content hash claimed
by `PBp3…`'s sequences), plus three February sequences with no public doc.
The retry runs on every open and shows "Sequence saved locally, but it is not
public on other devices yet." (they tapped Dismiss). Whether a duplicate of
another owner's sequence should stay public, go private, or get a new id is a
product choice.

**E4, shop preview workers time out together (needs-investigation).** All
workers fail within one second, on Android Chrome and Windows Chrome. ISS-009's
fix (arm the timer after prep) is in place, so the cause is something else.
One user tapped "Reload" a second later. Next step: reproduce on /shop/starter-pack
with 6x CPU throttling and log per-worker spawn-to-init time.

**E6, Composer 3D worker evaluated Svelte runes (watching).** Worker bundles
build without the Svelte plugin (`vite.config.ts:1587`). A static import walk
of `environment-renderer.worker.ts` today finds no `.svelte.ts` module. The
only path is the lazy `import()` in
`src/lib/shared/animation-engine/services/led/led-pattern-materializer.ts:125`
→ `poi-image-library.ts:12` → `auth-state.svelte.ts`, which is caught. Not seen
since 10-16. Related latent risk: `qr-video/workers/headless-video-renderer.worker.ts`
statically reaches `canvas-resizer.svelte.ts` for one constant (harmless
today because the class with `$state` is tree-shaken).

## Friction patterns

| #   | Pattern                                                | Route                | Code site                                                     | Users | Sessions | Last seen | What the user was trying to do                                                           | Register      | Verdict                                                         |
| --- | ------------------------------------------------------ | -------------------- | ------------------------------------------------------------- | ----- | -------- | --------- | ---------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| F1  | Reloads then "Go Home" after Shape Engine error screen | /create/shape-engine | same as E1                                                    | 3+    | 3        | 10-21     | Open the Shape Engine from Create                                                        | new (with E1) | fixed with E1                                                   |
| F2  | Dismisses the same warning toast every open            | /create              | same as E3                                                    | 1     | 6        | 10-20     | Just open the app                                                                        | new (with E3) | needs-design                                                    |
| F3  | Rage click on 3D scene tiles (Ocean, Winter)           | /sequence/EHWE       | `src/lib/shared/3d/components/SceneSelectorPopover.svelte:84` | 5     | 5        | 09-04     | Switch the 3D scene; the tile turns active at once but the scene takes seconds to arrive | none          | needs-design (loading feedback); watching, not seen since 09-04 |
| F4  | Taps "Reload" right after preview workers fail         | /shop                | same as E4                                                    | 1     | 1        | 10-21     | Look at a product                                                                        | ISS-009       | with E4                                                         |

Not friction: repeated taps on steppers (Length, BPM, "15" speed) register as
rage clicks but change the value each time. Dead clicks on `/sequence/…` are
taps on the playing viewer, which pauses it with no DOM change; that user
stayed an hour.

## Fixed in this run

1. **Triage tooling read an empty field** (clear-cut). `buildTriageSessionEventsQuery`
   and the profile-read denial check read only `$exception_message`. Now they
   read `$exception_types[1]` / `$exception_values[1]` (and the list as a
   string for the denial match). The denial query now returns 3 real
   `users/{id}` get denials (2026-09-03, 09-06) where it returned none.

## Register writes not made (apply with Austen's yes)

New issues:

- "Shape Engine crashes as it opens" · /create/shape-engine ·
  `ShapeMatrixAppShell.svelte` · uids 40ovmSoxdR…, fwIvozELzN…, f3fb2ded…,
  f7664fce…, a07cc281… · status `resolved` once 14 quiet days pass after the
  10-22 publish (no feedback item; file one marked completed to let the rule close it).
- "Signing in on Browse signs you straight back out" · /browse ·
  `src/lib/shared/auth/services/guest-identity.ts` · uid pMIimU60H2… ·
  session `01a161f9-0970-74f9-9561-bb3d845716ea` · `watching` (1 user, fixed).
- "Publishing keeps failing and warning on every app open" · /create ·
  `src/lib/shared/library/services/library-repository.ts` · uid 40ovmSoxdR… ·
  sessions `01a145c3-528a-7b74-8806-77843ed0c948`, `01a15a86-a257-7839-851f-e5c957139b05` ·
  `watching` (1 user; tester account).
- "Guide glyphs fail on crawler visits" · `GlyphRenderer.svelte` · status
  `dismissed` (not people).

Recurrences:

- ISS-009 (resolved) ← E4: 2 uids, sessions `01a15f61-97f7-7c98-8a0b-b433b2921cdf`,
  `01a1598f-cdd1-7a17-916f-b009fe6bd348`. Reopens.
- ISS-010 (open) ← E5: session `01a15f61-97f7-7c98-8a0b-b433b2921cdf`.
- ISS-013 (resolved) ← C2 by code site. Crawler only; recommend not reopening.

Resolve-on-silence: none qualify. Every open issue's feedback item is
`in-review` or `archived`, never `completed`. ISS-006 and ISS-007 have archived
feedback and have been quiet since August, so the rule can never close them.

Watermark: would advance `reviewedThrough` to the newest session read
(2026-10-22T15:42Z) and append the 40 analyzed session ids.
