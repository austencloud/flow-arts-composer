# Product Decision Analytics Coverage

**Status:** Shipped. Moved out of `active/` on 2026-09-13 during spec
reconciliation.

**Reconciliation evidence (2026-09-13):** `8d688b0d5` (_feat(analytics): cover
product decisions_) landed the spec, the ledger
(`docs/architecture/product-analytics-coverage.md`) and six test files together.
Every event in the gap table exists with its named completion boundary, and the
source vocabulary in `viewer-events.ts:4-22` is a closed union of exactly the 18
listed values with no `unknown` member, so a new call site cannot default
silently. Success-only emission is asserted, not assumed
(`user-follow-analytics.test.ts` emits follow only when the transaction creates
the relationship; `followed-collections` does not emit when the write fails).
The 450ms settle-boundary coalescing preserves `previous_value` and suppresses
no-op transitions. Dev capture is off (`posthog.ts:277`). The analytics unit
tests pass. The production PostHog query this spec names as its
post-deployment proof is outside the repository and stays outside it.
**Date:** 2026-09-01
**Owner:** `src/lib/shared/analytics/services/posthog.ts`

## Outcome

Every meaningful user decision and every completed product state transition
emits an explicit PostHog event. Ordinary links, route changes, and low-signal
DOM interactions remain covered by PostHog autocapture and pageviews. Tracking
every render, hover, disclosure toggle, or keystroke would duplicate that data
and make the decision events harder to trust.

Analytics is always an observer. An SDK failure must never interrupt the user
action being measured.

## Event boundary

Add a custom event when the answer changes a product decision:

- a persistent relationship or artifact changed;
- a user crossed between discovery, viewing, creating, and saving;
- a primary workflow started, completed, failed, or was deliberately abandoned;
- an in-place surface changed without a route or autocaptured link that can
  answer the same question.

Do not add a custom event for:

- ordinary anchor navigation already represented by `$autocapture` and
  `$pageview`;
- rendering, loading spinners, hover, focus, or disclosure fidget;
- continuous values at pointer frequency;
- raw display copy or unbounded URLs.

## Known gaps closed by this work

| Question                              | Event                                          | Completion boundary                                                        | Stable properties                                     |
| ------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Did a creator relationship change?    | `user_follow`, `user_unfollow`                 | Firestore transaction changed the relationship                             | `source`, `target_user_id`                            |
| Did a collection relationship change? | `collection_followed`, `collection_unfollowed` | Firestore write completed                                                  | `source`, `owner_id`, `collection_id`                 |
| Did somebody open a creator profile?  | `creator_profile_opened`                       | Creators routing committed the profile view                                | `source`, `target_user_id`                            |
| Did somebody open a sequence?         | `sequence_view`                                | Shared viewer overlay or standalone viewer became the selected destination | `viewer_source`, `sequence_id`                        |
| Did somebody begin a remix?           | `sequence_remix_started`                       | Viewer accepted the Remix action                                           | `viewer_source`, `sequence_id`                        |
| What do people do inside the viewer?  | `viewer_*` family                              | A real action or scalar transition occurs                                  | `viewer_source`, `sequence_id`, bounded action fields |

User, collection, and sequence IDs are correlation keys. They are not normal
breakdown dimensions and no display names, words, or free text are attached.

The module ledger review also added outcome owners where route and click data
could not prove completion: Learn, Tika, Compose, Arena, Train, Feedback,
Festivals, and Choreo. These events are listed in the canonical coverage ledger
rather than duplicated here.

## Viewer dual attribution

The shared viewer appears both inside the app and on QR routes. Its current
interaction sinks are scan-specific and intentionally no-op outside `/q`, which
makes ordinary Browse, Library, Creator, Inbox, and Create viewer sessions
invisible.

Every viewer interaction now emits a general `viewer_*` event. During an active
scan visit, the existing `qr_*` event also fires with its scan-session, deck,
and shortcode attribution. The dual write is deliberate: the general event
answers product usage questions; the QR event answers printed-card questions.

## Source vocabulary

Viewer sources are a closed union owned by the sequence viewer analytics
module. The initial values cover the current call sites:

- `browse_gallery`
- `browse_library`
- `browse_collection`
- `creator_directory`
- `creator_profile`
- `inbox_notification`
- `inbox_message`
- `create_workspace`
- `fuse`
- `effects_lab`
- `deck_release`
- `share_intake`
- `spiroanim`
- `lineage`
- `tunnel_collection`
- `url_restore`
- `external_link`
- `qr`

New call sites must choose a value from this union rather than silently
defaulting to `unknown`.

## Coverage ledger rule

Every production module must have a ledger row identifying:

1. its entry signal;
2. its primary user decision or durable success signal;
3. its failure or blocked-path signal when failure can be silent;
4. whether each signal is explicit, autocaptured, deliberately omitted, or a
   remaining gap.

The ledger is evidence, not a percentage score. A module with one decisive
event can be better instrumented than a module with fifty button events.

## Verification

`captureEvent` and `captureWhenReady` deliberately no-op in local development.
Verification therefore uses focused unit tests that assert exact event names,
properties, deduplication, and success-only emission, plus the normal project
type and test checks. A production PostHog query is the post-deployment proof;
localhost traffic must never be enabled to manufacture it.
