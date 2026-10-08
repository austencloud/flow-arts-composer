---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify share-session reset, artifact support, card footer ownership, and Library flow against the silent-regression contract.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Share Flow Content Ownership

**Status:** Approved for implementation
**Date:** 2026-08-31
**Supersedes:** Footer and caption ownership assumptions in the 2026-08-09 social-post handoff design

## Decision

Sharing has three different kinds of state. The product must name and preserve
their boundaries instead of making every control look like a choice for the
current post.

| Scope                   | Owner                          | Lifetime                                |
| ----------------------- | ------------------------------ | --------------------------------------- |
| Account defaults        | `ImageCompositionStateManager` | Future cards and new viewer sessions    |
| Saved card presentation | The library sequence record    | The sequence until the owner changes it |
| Share draft             | `PostShareSheet`               | One opening of the share sheet          |

The Card tab is the full card editor. A saved sequence opened from Library uses
that same tab, so Library does not build a second card editor. The share sheet
is the final confirmation surface: it may override the card footer for one post,
but canceling the sheet discards the override. Persisting an override requires
an explicit **Save to card** action.

## Language and Privacy

The product currently uses “notes” for four different things:

1. private Library notes;
2. an optional line rendered into a card;
3. generated taglines on some legacy sequences;
4. a social-post caption.

The UI will use two unambiguous labels:

- **Card footer** — appears inside the image.
- **Post caption** — accompanies the post.

`SequenceData.notes` and `LibrarySequence.notes` remain private annotations.
They are never copied into a card footer or post caption automatically. Saved
card content uses a dedicated `cardPresentation` field, and the public sequence
projection continues to omit both private notes and presentation metadata.

## Card Footer Model

A card footer has one of three modes:

- **Off** — no footer text or footer-only geometry.
- **Credit** — the product credit, “Created using Flow Arts Composer.”
- **Custom** — user-entered text, capped at the renderer-safe UI limit.

The model is versioned and normalizes untrusted persisted input. Renderer-facing
legacy names such as `showNotes` and `customNotesText` remain adapters only;
they are not the product vocabulary.

## Surface Contracts

### Card tab

- Shows the full composition editor.
- Uses the shared card-footer editor.
- Seeds from the saved sequence presentation, falling back to account defaults.
- Changes the current viewer session immediately.
- Offers **Save to card** only for a sequence the signed-in owner has saved.

### Library

- Opening a saved sequence continues to use the canonical sequence viewer and
  Card tab; collections do not grow a parallel editor.
- **Save to card** writes only `cardPresentation` on the owner record.
- Private notes remain editable only through their existing metadata path.

### Share sheet

- Opens from a clean share draft every time.
- Seeds the footer from the current Card-tab presentation.
- Clearly explains that the footer appears in the image.
- Keeps post caption separate and resets it on every new share session.
- Cancels without mutating the card or account defaults.
- Can explicitly persist the footer through **Save to card** when the host
  exposes that capability.
- Shows only artifacts the host can actually produce.

### Account defaults

- Continue to live in `ImageCompositionStateManager`.
- Supply the initial footer for sequences without saved presentation metadata.
- Are not silently modified from the share sheet.

## Entry-Point Capability Matrix

| Entry point       | Card                             | Video                  | Save footer         | Inbox              |
| ----------------- | -------------------------------- | ---------------------- | ------------------- | ------------------ |
| Sequence viewer   | Yes                              | When a renderer exists | Owned saved records | When available     |
| Create workspace  | Yes                              | No                     | No, until saved     | Full accounts only |
| Art / scene share | Card fallback plus active render | Yes                    | Owned saved records | When available     |

The artifact selector collapses when only one artifact is available. A no-op
render callback is never represented as a working Video choice.

## Destination Corrections

- Guest users may open the Create share sheet and download or use native file
  sharing for a locally rendered card. Account-bound destinations remain gated.
- Desktop Facebook continues to prioritize the image clipboard because one
  clipboard cannot hold an independently pasteable image and caption. The UI
  must describe that handoff honestly and keep **Copy caption** available as the
  explicit second step.
- Opening the sheet may resolve a short link, but a failed link must not block
  local card delivery.

## Motion and Layout

Changing footer mode is intentional disclosure. The Custom text field enters
and leaves through the shared reduced-motion-aware `growFade` transition. The
artifact selector uses equal tracks and is removed entirely when only one
choice exists, preventing a single stretched segment. Preview geometry remains
reserved while the card re-renders.

## Verification

Silent-regression tests must prove:

1. a share session resets caption, touched state, artifact, and footer override;
2. unsupported artifacts cannot become active;
3. private `notes` never seed card presentation;
4. footer modes resolve to the expected renderer options;
5. footer text participates in the card render/cache key;
6. canceling a share does not persist presentation changes;
7. saving a presentation patches only the owned library record;
8. the Create workspace exposes Card without a dead Video choice.

Runtime verification must compare the live Card preview with the shared PNG and
exercise the share sheet at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
2560×1440, and 3840×2160, plus 200% browser zoom. The footer/caption distinction,
Custom-field transition, single-artifact layout, and reduced-motion endpoint
must be inspected visually.

## Capability Ownership Evidence

Search terms: `customNotesText`, `showNotes`, `PostShareSheet`, `ExportImagePanel`,
`StaticSettings`, `updateNotes`, `getCardImageBlob`, `captionTouched`, and
`onRequestVideo`.

- **Extending `PostShareSheet`** with a real share-draft boundary.
- **Extending `ExportImagePanel`** with scoped card-presentation input while it
  remains the full card-composition owner.
- **Extending `library-action-handler`** with presentation persistence.
- **Creating `CardFooterEditor`** as the shared presentation for the existing
  footer capability; it delegates rendering and persistence to the owners above.
- **Keeping private Library notes separate** because their interaction and
  privacy contract is different from public artifact content.
