---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify /q route ownership, query preservation, scan recording, and legacy-route behavior against the consolidation gates.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Sequence Route Consolidation

**Date:** 2026-08-28
**Status:** Approved

## Product decision

There are two sequence-viewer destinations:

1. The in-app drawer preserves the surrounding gallery or composer context.
2. `/sequence/[id]` is the standalone, reloadable, shareable viewer.

`/q/[code]` is not a third viewer. It is the attribution boundary for a
physical scan. It validates the code, records the physical-card visit once,
then hands the resolved sequence to `/sequence/[code]` with `replaceState`.

```text
physical QR  -> /q/code -> scan attribution -> /sequence/code?from=scan&code=code
shared link  --------------------------------> /sequence/id
inside app   --------------------------------> sequence drawer
```

## Routing contract

- A normal copied or shared sequence link always uses `/sequence/[id]`.
- Only `/q/[code]` may call the physical scan-ingestion endpoint.
- The scan handoff preserves meaningful viewer state, including prop choices,
  render/view parameters, physical-card identity, demo state, and pending auth
  actions.
- Record-derived prop choices are added to the destination when the printed URL
  does not already specify them. That makes reloads truthful to the scanned
  card instead of relying on ephemeral settings.
- The ingress removes `v`, because `/sequence` is already the viewer and must
  not open a second drawer beneath itself.
- `/sequence` may rehydrate scan-session analytics when `from=scan` and `code`
  are present, but it never records a physical scan.
- The viewer's Copy Link and Share actions continue to serialize the sequence
  through the canonical sequence encoder. They do not copy scan attribution or
  physical-card identifiers.

## Capability contract

Scan-origin viewers still receive the existing shared-shell capabilities:

- card-first presentation and deferred interactive startup;
- persisted scan playback tempo;
- cloud-backed pictograph probing;
- scan action analytics;
- account sign-in and installed-app handoff;
- Guide handoff;
- free-account gating for downloads;
- 2D/3D, practice, edit/remix, share, and export through the canonical viewer.

These capabilities live in `/sequence` or the shared viewer services. The scan
route owns no viewer chrome, export UI, practice UI, or alternate layout.

## Navigation and layout

`/sequence` is a page, not a drawer. Its header uses ordinary Back navigation.
It does not register with `DrawerStack`, listen for swipe-to-dismiss gestures,
translate the page during a drag, or acquire rounded drawer corners on phones.

The drawer remains dismissible because it is genuinely an overlay over another
screen.

## Failure behavior

- A missing or unresolved scan code stays on `/q` and shows the existing
  retry/browse/create recovery path.
- Offline failures retry when connectivity returns.
- A failed analytics or scan-ingestion request never blocks the viewer handoff,
  but remains visible in browser or Worker logs.
- A failed client navigation keeps the ingress visible and ends the unfinished
  scan session instead of leaving attribution active globally.

## Verification gates

- URL-builder tests cover query preservation, prop fallbacks, demo state, and
  removal of drawer-only state.
- Source-contract tests prove `/q` owns the only `recordCardScan` call and does
  not render `SequenceViewerShell`.
- Direct `/sequence` tests prove copied/shared routes have no physical scan
  ingestion path.
- Browser checks cover direct links, physical-scan handoff, reload,
  back/forward navigation, demo embedding, export/account affordances, console
  errors, and responsive layouts from phone through 4K.
