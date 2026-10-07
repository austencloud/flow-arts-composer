---
status: active
value: 4
effort: S
remaining: "Criteria 1, 3, 4, 5, 6 verified 2026-08-02; check is 0 errors / 0 warnings. Criterion 2 turned out to be BROKEN, not merely unverified: Austen tried the live popup and it dead-ended. Root cause was the sheet's fire-and-forget One Tap call, fixed in a0b1835945 by replacing SignInSheet with the shared AuthModal (see 2026-08-02-viewer-auth-surface-unification-design.md). A real Google OAuth popup now opens where zero opened before. Still open: one live end-to-end sign-in with Austen's own credentials to confirm the export auto-resumes after the popup completes — the popup launch is proven, the post-auth replay is not."
depends_on: "external: one live Google sign-in with Austen's credentials to confirm the post-auth export resume"
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: blocked
---

# /q Account Funnel — Download Gate + Sign-in Chip — Design

> **ROUTING UPDATE — 2026-08-28.** The funnel behavior is unchanged, but its
> viewer owner moved from `/q` to the scan-origin `/sequence` host. `/q` is now
> attribution ingress only. Re-run the remaining post-auth replay verification
> on the `/sequence/[code]?from=scan&code=[code]` destination.

> **DRIFT WARNING — 2026-08-02.** Verified 2026-08-02. Correctly BLOCKED, not drifting: `depends_on` already names the external gate (one live Google sign-in to confirm post-auth export resume). The body reads "Implemented; verification blocked", which the detector cannot distinguish from a stale done-claim. Criterion 2 is known BROKEN, not merely unverified — see `remaining`.
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state.


**Date:** 2026-07-05
**Status:** Implemented; verification blocked
**Author:** Claude (Fable 5) + Austen

## 2026-07-29 reconciliation

Commit `0f5e85a894` shipped the account gate and header entry. The later
shared-shell extraction in `fcd3a516d8` retained the gate but dropped the
header entry. This pass restores the entry through
`SequenceViewerShell.onAccountSignIn`, keeps a fixed header slot across auth
restoration, and adds regression coverage for the shell seam, download policy,
URL handoff, and queue expiry.

The focused funnel suite passes 24 of 24 tests. Required visual verification
remains blocked because Chrome DevTools MCP is not registered in this Codex
session. The shared full check also reports 15 errors from concurrent
`endless-spinner` and animation-engine changes; none of its diagnostics point
to the funnel files.

## Problem

The /q scan page gives everything away with no path to an account:

- Download (video + card export) is wired unconditionally for guests
  (`viewer-actions.ts:72` — scan profile sets `onDownload` with no auth gate).
  A cold scanner downloads the MP4 and leaves. No conversion moment.
- The scan header's top-right is empty on mobile (`ViewerHeader.svelte:155` —
  the scan CTAs render only `!isMobile`), wasting the one obvious account
  affordance slot on a standalone page.

Austen's strategy pick: **gate download behind a free account** ("play with
everything, pay to take it home" — watching stays free, keeping it is the
conversion lever), plus an always-present sign-in chip → avatar indicator.

## Decisions (made with Austen)

1. Download gate → free account. Watch/play, Open-in-Composer, Open-TKA stay free.
2. Top-right chip: signed-out = "Sign in" button → auth sheet; signed-in =
   avatar (RobustAvatar), tap = Open TKA. No account menu on the scan page.

## Architecture — reuse the gated-action machinery already live on /q

`SequenceViewerOrchestrator` already renders `SignInSheet`, runs
`authQueue.bootstrapFromUrl()` on mount, and replays the pending action after
sign-in (`replayPendingAction` effect). Scan download currently bypasses it by
calling `handleExport` directly. The gate is an action-type addition, not new
infrastructure.

### Changes

| File                                | Change                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending-action-queue.ts`           | `PendingActionType` += `"download"`; add to `VALID_TYPES` (enables `?pending=download` webview handoff).                                                                                                                                                                                                                          |
| `gated-action-policy.ts`            | `"download"` joins `FULL_ACCOUNT_ACTIONS`. Critical: outside this set, `invokeGatedAction` silently provisions an anonymous guest and runs the handler — no prompt, no funnel. Download must prompt.                                                                                                                              |
| `auth-action-queue.svelte.ts`       | `AuthActionQueueCallbacks` += `handleDownload: () => void`; replay switch gains `case "download"`. New `SignInReason = PendingActionType \| "account"` for the chip's non-action sheet open; `openSignInSheet(reason: SignInReason)`; `onSignInSheetPrimary` maps `"account"` → `null` for the webview handoff.                   |
| `SignInSheet.svelte`                | Copy records keyed by `SignInReason`. `download`: "Create a free account to download this sequence." `account`: "Sign in to save your scans and build your library." (+ webview variants).                                                                                                                                        |
| `SequenceViewerOrchestrator.svelte` | New optional prop `onGatedDownload?: (ctx) => void`, wired as the replay `handleDownload`. `OrchestratorContext` += `openSignInPrompt()` → `authQueue.openSignInSheet("account")` (the chip's hook).                                                                                                                              |
| `ViewerHeader.svelte`               | Scan profile `header-right`, all widths: signed-out (`!authState.isFullAccount`) → "Sign in" ghost CTA calling `ctx.openSignInPrompt()` (+ `qr_signin_from_chip` analytics); signed-in → `RobustAvatar` (sm) as a link to `openAppHref`, `aria-label="Open TKA"`. Reuses existing `.cta.ghost`; no new primitives.                |
| `/q/[code]/+page.svelte`            | Header Download, AnimationPanel export, and card export route through `ctx.invokeGatedAction("download", realHandler)`. Page-local `pendingExportKind: "video" \| "card"` set before each gate call so post-sign-in replay resumes the right export; `onGatedDownload` reads it. `qr_download_gated` analytics on guest gate hit. |

### Flow (guest taps Download)

1. `/q` sets `pendingExportKind`, calls `ctx.invokeGatedAction("download", run)`.
2. Not a full account → queue `?pending=download`, open `SignInSheet`
   ("Create a free account to download this sequence.", Google One-Tap-first).
3. Sign-in completes → existing replay effect fires → `handleDownload` →
   `onGatedDownload(ctx)` → `/q` resumes the requested export. No re-tap.
4. Signed-in scanner: handler runs immediately, zero friction.

Webview handoff (in-app browsers): URL carries `?pending=download` into Chrome;
`bootstrapFromUrl` re-opens the sheet; replay resumes the **video** export
(`pendingExportKind` is page state and doesn't survive the handoff — video is
the primary CTA; acceptable, documented).

## Scope guard

The full viewer (`/sequence`) is untouched: its download flows through the
export panels, not `buildHeaderActions`' scan branch, and it never calls
`invokeGatedAction("download", …)`. Only /q routes download through the gate.

## Non-goals

- Account menu / sign-out on the scan page.
- Gating Open-in-Composer (already funnels via `?sheet=auth`) or watch/play.
- Email-link auth on the sheet (SignInSheet is Google-first by design; the
  composer handoff offers the full AuthSheet).

## Verification (Chrome DevTools MCP, localhost — user is remote)

1. Signed-out: tap header Download → sheet opens with download copy,
   `?pending=download` in URL, no export starts.
2. Sign in (popup) → export starts automatically (ExportTakeover appears).
3. Signed-in: Download runs immediately, no sheet.
4. Chip: signed-out shows "Sign in" (44px target), opens sheet with account
   copy; signed-in shows avatar linking Open TKA. Mobile width: chip present
   (previously empty corner).
5. Card-mode export gates the same way and resumes the card export.
6. `npm run check` clean; screenshots mobile + desktop.

## Verification results, 2026-08-02 (Chrome DevTools MCP, localhost)

Signed-out cases ran in an isolated browser context (`guest-qr`) so Austen's
own session was never disturbed; signed-in cases ran in the default context.
Short code `003N`.

| # | Criterion | Result |
|---|---|---|
| 1 | Signed-out Download → sheet + `?pending=download`, no export | **PASS.** URL became `/q/003N?pending=download`; sheet read "Create a free account to download this sequence."; no ExportTakeover appeared. |
| 2 | Sign in (popup) → export starts automatically | **OPEN — cannot be agent-verified.** Requires entering Austen's Google credentials. See note below. |
| 3 | Signed-in Download runs immediately, no sheet | **PASS.** ExportTakeover appeared ("Capturing…"), no sheet, no `pending` param. Export cancelled to avoid writing a file. |
| 4 | Chip: signed-out "Sign in" 44px; signed-in avatar → Open TKA | **PASS.** Mobile 375×667: chip present, 88×44 (min-height 44px). Signed-in: no chip, avatar present, `<a aria-label="Open TKA" href="/browse/gallery?from=scan&code=003N">`. |
| 5 | Card-mode export gates identically | **PASS.** "Download Card" produced the same `?pending=download` and the same sheet copy. |
| 6 | `npm run check` clean + screenshots | **PASS.** 0 errors, 0 warnings. Desktop 1920 and mobile 375 both captured. |

### Note on criterion 2

The replay wiring itself is confirmed correct by reading the code path
(`replayPendingAction` drains the queue, clears the param, and dispatches
`case "download"` → `onGatedDownload` → `handleExport`, with
`pendingExportKind` defaulting to `"video"` at `QScanPage.svelte:575`). What
remains unproven is the live transition.

An attempted proxy — loading `/q/003N?pending=download` while **already**
signed in — consumed the param but started no export, with no console error.
That is an off-spec state (a signed-in user cannot naturally hold that URL,
since the param is only appended when the gate trips for a guest), and the
likely cause is that replay fires before `deferInteractiveStartup` has brought
the export machinery up. It is recorded here as an observation, not a defect,
because it neither confirms nor refutes the real flow.
