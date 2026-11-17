# Product analytics coverage ledger

**Updated:** 2026-09-01
**Canonical client:** `src/lib/shared/analytics/services/posthog.ts`

This ledger answers a narrower question than “does this component contain an
analytics call?” It records whether PostHog can answer how a module is entered,
whether its primary value-producing action happened, and whether an otherwise
silent failure is visible.

## Coverage classes

- **Explicit** means a named event represents a product decision or completed
  outcome.
- **Autocaptured** means `$pageview`, click/form autocapture, or dead-click
  detection already answers the question. Adding another event would duplicate
  it.
- **Omitted** means the interaction is rendering, hover, disclosure, continuous
  pointer input, or operator-only work rather than a product outcome.
- **Gap** means a decision should be explicit but has no stable event owner.

## Universal substrate

Every navigation-state module and tab change emits `module_view`. The activity
logger now waits for PostHog initialization instead of dropping an early event.
All production history navigation emits `$pageview`; ordinary links, buttons,
and forms are autocaptured; dead clicks and uncaught exceptions are enabled in
production. These signals are the entry and basic-failure floor for every row
below, including modules whose content is exploratory.

Local development remains excluded. Local tests assert the event contract, but
do not manufacture product traffic.

## Module ledger

| Module       | Entry signal                                                                       | Primary decision or success                                                                  | Failure signal                                                                             | Class                                                       |
| ------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Create       | `module_view` with tab, `sequence_action_surface_shown`, `sequence_actions_opened` | `sequence_create`, `sequence_save`, `sequence_autosaved`, `sequence_action_*`, `construct_*` | sequence-action results, repository exceptions, and explicit autosave/share failure events | Explicit                                                    |
| Browse       | `module_view`, `browse_destination_entered`                                        | `browse_collection_opened`, `sequence_view`, `viewer_*`, library create/delete events        | explicit library delete failures plus exceptions/dead clicks                               | Explicit                                                    |
| Creators     | `module_view`, `creator_profile_opened`                                            | `user_follow`, `user_unfollow`, creator `sequence_view`                                      | follow transaction failure is user-visible and exception-tracked                           | Explicit                                                    |
| Social       | `module_view`; map-driven `creator_profile_opened`                                 | shared creator follow outcomes                                                               | sync/connect failures are user-visible; ordinary map movement is omitted                   | Explicit                                                    |
| Learn        | `module_view`, `lesson_start`, `quiz_start`                                        | `lesson_complete`, `quiz_answer`, `quiz_complete`                                            | quiz UI error states plus exception tracking                                               | Explicit                                                    |
| Tika         | `module_view`                                                                      | `tika_question_submitted`, with no question text                                             | request/stream failures are visible and exception-tracked                                  | Explicit                                                    |
| Premium      | `$pageview`, `premium_page_viewed`                                                 | `premium_cta_clicked`, checkout initiation/redirect/error                                    | `checkout_error`                                                                           | Explicit                                                    |
| Compose      | `module_view`                                                                      | `composition_saved`, `composition_deleted`, `composition_favorite_changed`                   | local/cloud save warnings plus exceptions                                                  | Explicit                                                    |
| Arena        | `module_view`                                                                      | `arena_vote_completed`, `arena_matchup_skipped`                                              | failed votes restore the matchup and are exception-tracked                                 | Explicit                                                    |
| Train        | `module_view`, `train_session_started`                                             | `train_session_completed` with aggregate score fields                                        | camera/detection errors are visible and exception-tracked                                  | Explicit                                                    |
| Toys         | `module_view`                                                                      | entry plus autocaptured controls                                                             | dead clicks and exceptions                                                                 | Autocaptured; toys are ephemeral exploration                |
| Shop         | `$pageview`, `shop_product_viewed`                                                 | variant, cart, checkout, and purchase funnel events                                          | checkout errors and exceptions                                                             | Explicit                                                    |
| Choreo Cards | `module_view`; QR entry events                                                     | `qr_*` scan/viewer/export funnel                                                             | QR resolve/export failure events                                                           | Explicit for customer scans; operator deck controls omitted |
| Choreo       | `module_view`                                                                      | `choreo_sheet_saved`, `choreo_sheet_exported`, `choreo_sheet_deleted`                        | save/export errors are user-visible and exception-tracked                                  | Explicit                                                    |
| Feedback     | `module_view`                                                                      | `feedback_submitted` after the feedback document exists                                      | submission failure is user-visible; `feedback_thread_failed` / `feedback_thread_recovered` count the inbox message | Explicit                                                    |
| Festivals    | `module_view`                                                                      | `festival_submitted`, `festival_tracker_changed`, `festival_tracker_removed`                 | submission and persistence failures are user-visible                                       | Explicit                                                    |
| Museum       | `module_view`                                                                      | route entry and autocaptured exhibit choices                                                 | dead clicks and exceptions                                                                 | Autocaptured; navigation is the product action              |
| My Museum    | `module_view`                                                                      | route entry; sequence opens use `sequence_view`                                              | viewer and exception signals                                                               | Explicit where an artifact opens; otherwise autocaptured    |
| Retro        | `module_view`                                                                      | tab/route entry and autocaptured controls                                                    | dead clicks and exceptions                                                                 | Autocaptured; no durable artifact owner                     |
| Levels       | `module_view`                                                                      | tab/route entry and autocaptured lab controls                                                | dead clicks and exceptions                                                                 | Autocaptured; continuous lab values omitted                 |
| Hand Paths   | `module_view`                                                                      | sequence opens use `sequence_view`; ordinary exploration is autocaptured                     | viewer and exception signals                                                               | Mixed explicit/autocaptured                                 |
| Video        | `module_view`                                                                      | shared viewer/export events where the canonical viewer owns the action                       | export and exception signals                                                               | Mixed explicit/autocaptured                                 |
| 3D Studio    | `module_view`                                                                      | shared viewer/export events where the canonical viewer owns the action                       | export and exception signals                                                               | Mixed explicit/autocaptured                                 |
| Settings     | `module_view`                                                                      | `setting_change` with bounded old/new scalar values                                          | persistence warning plus exceptions                                                        | Explicit                                                    |
| Admin        | `module_view`                                                                      | none in product analytics                                                                    | exceptions                                                                                 | Omitted; operator-only                                      |
| Lab          | `module_view`                                                                      | none in product analytics                                                                    | exceptions                                                                                 | Omitted; experimental/operator-only                         |

No production-module row has an unowned high-value gap after this pass. New
durable actions must add a named event at the service or state owner that can
prove success. New exploratory controls inherit the universal substrate unless
they become a saved artifact, relationship, funnel step, or in-place workflow
completion.

## Shared viewer contract

Every real viewer host supplies a closed `viewer_source` value. The shell emits
`sequence_view` once per mount and routes actions, exports, playback, practice,
settings, and view changes through the `viewer_*` family. QR visits also retain
their existing `qr_*` attribution, so product usage and printed-card performance
remain separately queryable.

Embedded shop demos are excluded from both viewer families. Their interactions
belong to the landing demo taxonomy and must not inflate real sequence-view
metrics. No-change settings/view transitions and disclosure-only menu toggles
are also excluded.

## Shared keyboard contract

`KeyboardShortcutManager` emits `keyboard_shortcut_executed` only after a
registered shortcut has matched its active context and conditions. Rejected
shortcut actions emit `keyboard_shortcut_failed`; deliberate Alt-hint discovery
and the shortcut center have their own bounded events. The keyboard contract
never records unmatched keys, arbitrary typing, form values, or editable text.

Feature actions reached by keyboard keep their own product event as well. For
example, a Create transform emits both the generic shortcut ID and a
`sequence_action_invoked` event whose source is `keyboard`. This preserves
cross-feature keyboard adoption without losing the feature-level funnel.

## Property rules

- Event names are lower snake case.
- Source values are closed unions at call sites, not free text.
- IDs may be attached as correlation keys but are not intended as ordinary
  breakdown dimensions.
- User copy, sequence words, feedback text, Tika questions, display names, and
  unbounded URLs are never attached.
- Continuous values are emitted only at a settled/coalesced boundary.
- Outcome events fire after the owning write completes; intent events are named
  as intent or start events.

## Query starting points

- Discovery to relationship: `creator_profile_opened` → `user_follow`
- Discovery to use: `browse_destination_entered` → `sequence_view` →
  `viewer_action`
- Creation to durable value: `sequence_create` or `sequence_save`
- Learning loop: `quiz_start` → `quiz_answer` → `quiz_complete`
- Training loop: `train_session_started` → `train_session_completed`
- Printed card loop: `qr_scan_landed` → `qr_viewer_opened` → `qr_*`
- Purchase loop: `shop_product_viewed` → `shop_add_to_cart` →
  `shop_checkout_started` → `shop_purchase_completed`
