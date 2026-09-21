# Sharing and export experience

Research and product decisions recorded September 14, 2026. This is the starting
point for changes to sequence sharing, file downloads, device transfer, and social
publishing in Flow Arts Composer. Read this before redesigning those flows.

## Purpose and evidence boundaries

People should recognize what they are sending and correctly predict the result
before choosing an action. Preserve the intention and appearance established in
the viewer. Complete the requested delivery without unnecessary confirmation or
preparation steps.

Austen explicitly requested that this research be retained for future agents.
Do not repeat the foundational research merely because a new agent or task starts.
Use the sources below and extend this record when a real product question or
changed platform behavior warrants new research. Product documentation describes
precedents, not proof that its exact layout is optimal. The recommendations here
are design decisions informed by those precedents and usability guidance. They
are not results of usability testing with Flow Arts Composer users.

Browser support, social integrations, and account requirements change. Recheck
the affected platform documentation when implementing those capabilities. Never
interpret this dated research as a guarantee of future browser behavior.

## What failed in the previous design

Austen tested the actual application and reported these failures:

- Export animation started capture before allowing settings to be reviewed.
- Cancelling left a preview indefinitely labelled as rendering.
- A small modal scrolled on a 4K display while leaving large empty regions.
- Opening Share after watching animation unexpectedly selected a card.
- Resolution, quality, frame rate, navigation, and delivery all competed through
  similarly prominent buttons.
- Caption was ambiguous: text on the card, text on the video, or a social post?
- Advanced concealed the ordinary choice of loop count.
- Post Studio competed with exporting without explaining its purpose.
- Disabled sharing destinations did not explain how to become available.
- Copy link required a preparation click followed by another copy click.
- Exporting a file, sending a sequence, and publishing a post occupied one screen.

Making the modal wider fixed some geometry but preserved this confusion. Do not
restore that composition through a different set of equally weighted boxes.

The app is **Flow Arts Composer**. TKA names **The Kinetic Alphabet**, the notation
system. It must not name the app, its messaging, accounts, or delivery metadata.

## Source record

All sources were reviewed September 14, 2026. Summaries are deliberately short;
follow the links for their complete context.

| Source                                                                                                                                             | Verified behavior or guidance                                                                                                                                  | Application to this product                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Apple: iMovie file export](https://support.apple.com/en-ie/guide/imovie/move6e0cb2ad/mac)                                                         | File export shows a preview; adjusting custom quality updates estimated file size.                                                                             | Show the artifact and consequences of output choices. Only show a file-size estimate when the application can calculate one honestly.                                                              |
| [Microsoft: Clipchamp export](https://support.microsoft.com/en-US/Clipchamp/exporting-and-saving-a-video-in-clipchamp)                             | In the personal version, resolution selection starts export, progress is shown, and completion downloads automatically. Work-account storage behavior differs. | A download request can own preparation and delivery. A mandatory second Download click is unnecessary on a supported download path.                                                                |
| [Figma: sharing files and prototypes](https://help.figma.com/hc/en-us/articles/360040531773-Share-files-and-prototypes)                            | Sharing distinguishes links and invitations, exposes access permissions, and can preserve a selected frame in a link.                                          | Preserve the view being shared and make the recipient's experience understandable. Do not confuse a live sequence link with a media file.                                                          |
| [Canva: downloading through Share](https://www.canva.com/help/download-flattened-pdf-variantb/)                                                    | Share leads to a distinct Download flow with file-specific settings.                                                                                           | A common entry point may lead to focused tasks; it need not display every task simultaneously.                                                                                                     |
| [Adobe Express: social publishing](https://helpx.adobe.com/express/web/publish-and-share/share-to-social-media/schedule-publish-social-posts.html) | Social publishing chooses channels, adds a post caption, and schedules or publishes.                                                                           | Introduce caption and account choices in a publishing context. They do not belong in ordinary download settings.                                                                                   |
| [Apple: collaboration and sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing)                        | Recommends convenient system sharing and a small, clearly grouped set of options; permission summaries should be concise.                                      | Use familiar sharing conventions and explain access when it matters.                                                                                                                               |
| [Android: sending data to other apps](https://developer.android.com/develop/ui/compose/sharing/send)                                               | Recommends the system Sharesheet; it can rank targets with system context and show richer content previews.                                                    | Prefer a supported system chooser over a handmade grid of destination brands. Supply the correct content type. This native guidance informs design; it does not give the web app native-only APIs. |
| [NN/g: recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/)                                                           | Relevant visible cues support recognition and reduce the need to recall information.                                                                           | An actual current-view preview anchors the task better than a generic Ready to render message.                                                                                                     |
| [NN/g: information scent](https://www.nngroup.com/articles/information-scent/)                                                                     | Labels, context, and prior experience help people anticipate where an action leads.                                                                            | Use labels such as Video settings, Copy link, and Download video. Avoid unexplained internal feature names.                                                                                        |
| [NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)                                                           | Frequent needs belong in the initial view; secondary controls need a clear, predictable entry. Excessive disclosure levels add complexity.                     | Keep selected output values visible. Reveal their editors through a named control. Do not hide repeats inside another Advanced menu.                                                               |
| [NN/g: the three-click rule](https://www.nngroup.com/articles/3-click-rule/)                                                                       | Click count alone omits reading, orientation, and decision effort.                                                                                             | Remove redundant clicks without turning every possible choice into a simultaneous decision.                                                                                                        |
| [NN/g: visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)                                                         | Scale, contrast, and grouping establish priority; too much equal emphasis weakens it.                                                                          | Give the artifact and primary action prominence. Use quieter controls and semantic color, not equal outlined tiles for everything.                                                                 |
| [NN/g: response times](https://www.nngroup.com/articles/response-times-3-important-limits/)                                                        | Rough response-time guidance distinguishes immediate feedback, interrupted flow, and longer waits needing feedback and interruption.                           | Acknowledge actions promptly, show real progress for lengthy preparation, and provide cancellation. These are guidelines, not guaranteed human timing thresholds.                                  |
| [GOV.UK: buttons](https://design-system.service.gov.uk/components/button/)                                                                         | Disabled buttons can confuse users and should be justified by evidence.                                                                                        | Do not expose unexplained inactive destination tiles. Offer an actionable path or a clear reason and alternative.                                                                                  |
| [W3C: clear page purpose](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p01-clear-purpose/)                                                 | Clear titles and context help people understand where they are, including after distraction.                                                                   | Title each route for its current purpose. Download animation should not retain a misleading Share sequence title.                                                                                  |
| [W3C: Web Share API](https://www.w3.org/TR/web-share/)                                                                                             | Sharing requires transient user activation; targets may discard or combine data fields.                                                                        | A long render cannot reliably finish by opening a system chooser without a new click. Accompanying text is not guaranteed to arrive as a post caption.                                             |
| [MDN: navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)                                                           | Availability varies; file sharing needs capability checks. Promise resolution represents different handoff stages across platforms.                            | Detect actual file support. Do not claim a post was published merely because the system accepted a sharing request.                                                                                |
| [MDN: Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)                                                               | Clipboard permission and user-activation requirements differ across browsers.                                                                                  | Preserve the initiating copy gesture; link preparation must not silently turn Copy link into a two-click workflow.                                                                                 |

## Product decisions

### September 20 continuation: three destinations

The approved next iteration keeps three top-level intentions: **Download a file**,
**Share a link**, and **Publish socially**. These are distinct tasks within the
existing sharing owner, not three new delivery implementations. The current view
supplies the recognizable subject before a person chooses a destination.

- Download opens with the artifact implied by the viewer. Video and card are
  file choices inside that task. Resolution, frame rate, repeats, opener image,
  and card presentation belong here; captions and account connections do not.
- Share a link explains the recipient's experience and offers a single Copy link
  action. Sending through Flow Arts Composer hands off to the existing viewer
  send mode without rendering a file.
- Publish socially owns post caption, account review, and the post composition
  entry. An unavailable integration remains unavailable. Opening this task does
  not upload media, connect an account, or publish anything.

Direct Export still enters Download immediately. The three intentions must not
become a compulsory extra chooser for an action whose destination is already
known. A roomy desktop uses preview and settings together; a narrow screen
stacks them. Width and height both determine when disclosure is useful.

The continuation also identified two state requirements: a canceled or failed
3D scene take must return to a usable download task, and a download invalidated
by source/settings changes must explicitly invite a retry rather than silently
discard its promised delivery. Tunnel and 3D previews must come from their live
source, never from an unrelated 2D animation.

### Entry context determines the initial task

| Entry                | Initial presentation                                                           | Primary result                                                               |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Export animation     | Download animation, recognizable current-view preview, current output settings | Prepare if necessary, then download the video                                |
| Export card          | Download card, card preview and card-specific settings                         | Download the displayed card                                                  |
| Share sequence       | Compact sequence sharing view with subject and clear actions                   | Copy its link, send a sequence attachment, or enter contextual file download |
| Design a social post | Existing post composition workspace                                            | Prepare an intentional social post                                           |
| Direct publishing    | Separate, explicitly entered publishing flow                                   | Review the actual account, media, caption, and publishing action             |

The same file setup is reused from Export and Share. Direct export does not need
Back to sharing; navigation from the sharing menu does. Do not switch an animation
to a card merely because an old sheet default used that artifact.

### File preparation

- Opening settings does not start export, upload a file, or connect an account.
- Show a recognizable snapshot or existing preview of the current view before
  rendering. Preserve props, effects, and framing. Do not mount a second expensive
  renderer just to fill the dialog. A snapshot must not pretend to be a playable
  completed export.
- The selected settings remain visible in a compact summary. Editing is available
  through Video settings, with ordinary repeats labelled plainly. Preserve valid
  explicit user choices; do not quietly replace them with a guessed preference.
- Download card follows the same shape: a Card settings summary (theme and
  footer) opens the full card editor that the viewer's Card tab uses, so the
  card is chosen as it is downloaded rather than through a footer-only override.
- Offer only settings consumed by the current renderer. At research time the 2D
  `exportAnimation` method omitted `quality`, while `export3DAnimation` consumed it.
  Standard/Cinema was therefore misleading on the 2D route.
- Download video expresses the requested outcome. Preparation is progress between
  that action and delivery, rather than a separate compulsory user task.
- An already prepared file is reused when its settings and source still match.
  Changing source/settings must never download an obsolete result as though new.
- Cancellation or close clears pending delivery. A late completion cannot trigger
  a download, upload, or new modal after cancellation.
- Export failure preserves useful context and offers a meaningful retry.

### Other delivery paths

- Copy link performs one copy action and reports its progress/result at that
  control. It does not render media. A copied link should preserve the intended
  view and must not misrepresent who can open it.
- Sending to a friend in Flow Arts Composer uses the existing sequence-attachment
  workflow; it is not a social publishing operation. From the viewer it is a
  mode, not a dialog: the workspace morphs the way it does for Practice. The
  card as currently configured fills the stage, recipients take the inspector
  column, and the note and Send sit in a bar across the bottom. Choosing who
  must not change what, so the card settings stay on the Card pane. Cancel or
  Escape restores the pane the person was on. The inbox drawer keeps its own
  send sheet for shares that start inside the inbox.
- Native sharing is available when the actual payload is supported. After a long
  render, a clear Choose app or Share video action may be required for browser
  user activation. Do not promise automatic chooser opening everywhere.
- Device transfer explains that a prepared file will be uploaded for phone access.
  Upload only after that explicit choice. A link QR and a file-transfer QR are
  different deliverables and should not share ambiguous labels.
- Post caption is accompanying publishing text, not a card footer or video overlay.
  Keep the card footer editor and post caption editor distinct.
- Preserve existing developer/account gates for direct social publishing. Do not
  turn a UI redesign into an authorization or integration rollout.
- Feedback states describe known facts: Link copied, Download started, or a handoff.
  Do not claim Saved to Photos, Sent to a friend, or Published without that evidence.

### Composition and accessibility

Use the [visual design canon](visual-design-canon.md), existing theme tokens, and
shared controls. The artifact carries visual identity and color. The primary action
has the strongest action treatment; settings and navigation remain quieter.

On desktop, give the preview and settings purposeful proportions. On phone, stack
them and keep the primary action reachable. Fit the modal to its content within
viewport bounds. Do not impose an arbitrary tall shell on a short action menu.
Use one content scroll owner only when the content actually exceeds available
height. Expanded settings on a large display must use available space.

Preserve readable text, keyboard operation, focus visibility, and touch targets.
Animate intentional disclosure through the shared motion owner. Reserve media
geometry and progress slots to prevent accidental movement. Reduced motion reaches
the same usable final state immediately.

## Implementation ownership

Search terms: share, download, export, caption, preview, send to a friend, transfer
to phone, prepared file, viewer source.

- `src/lib/shared/share/components/PostShareSheet.svelte`: extend the existing
  presentation owner for focused sharing/download/publishing views.
- `src/lib/shared/share/components/ShareSheetFrame.svelte`: reuse the existing
  modal shell and its viewport bounds.
- `src/lib/shared/sequence-viewer/state/viewer-shell-share-state.svelte.ts`:
  extend the source session owner for entry context and recognizable preview data.
- `src/lib/shared/animation-panel/state/export-options-state.svelte.ts`:
  reuse output settings and persistence.
- `src/lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.ts`:
  reuse actual rendering and cancellation.
- `src/lib/shared/share/services/post-handoff.ts`: reuse file, clipboard, and
  native delivery behavior.
- `src/lib/shared/inbox/state/send-attachment-state.svelte.ts` owns recipient
  selection and delivery for both send surfaces;
  `SendDestinationPicker.svelte` is the shared picker. The viewer's
  `SendSequenceWorkspace.svelte` and the drawer's `SendAttachmentSheet.svelte`
  are presentation only. In the viewer, send mode is the `send` inspector
  profile: the stage keeps the live view the person chose (Card, Motion, or
  side by side; the rail stays usable) and the recipient column takes the
  inspector track, docking under the stage where the track stacks. No card is
  rendered for the sender; the recipient still receives the sequence and its
  thumbnail. The outbox is the drawer's; hosts that mount the drawer lazily
  mount it on `inboxState.hostRequested`, and the workspace reads the
  registered outbox from `message-delivery-context.ts`.
- Existing post composition and publishing components remain their respective
  owners. Do not introduce a second renderer, modal stack, or delivery service.

### Guest file requests

Guests can open the download task, adjust settings, and see the preview, but
saving a video or card requires a full account. The dock replaces the Download
button with a one-line note and a `Create free account` action. The sheet closes
before the auth drawer opens because auth drawers paint beneath the share sheet
and the sheet makes the page inert. Copy link, in-app sending, and native
sharing stay available to guests. The Publish route shows the same gate
before any media is prepared and does not create a short link for guests. A
viewer that refuses to render reports as a
failure, not a cancel; cancel is reserved for the user's own action. When the
clipboard API is denied, copy link falls back to selection copy and, if that
also fails, reveals the link in a selectable field.

### The image a clip opens with

Players and file thumbnails show a video's first frame, so the download task
lets the person choose it. One row under the stage, labelled `Opens with`,
offers three choices: `First beat` (the sequence's start position), `This
frame` (the pose on screen when the sheet opened), and `Mandala` (the
sequence's mandala fingerprint). There is no scrubber. The stage shows exactly
the chosen image, so what the person sees is what the clip opens on. The
choice persists with the other video settings and marks an existing render
stale like any other setting. `First beat` adds nothing, because the export
already opens with one beat of the start position. The other two prepend a
one-beat hold of the chosen image at the export speed, drawn contain-fit over
black at output resolution, before the animation. The viewer owns the images:
the sheet receives a capture callback per choice and hands the chosen data URL
back with the render request, so the baked hold is the very image the stage
showed. The row is hidden for hosts whose render cannot open on a chosen image
(3D takes, art views, Post Studio renders). When an opener applies, the
Instagram cover points at time zero unless the person picked a cover frame
explicitly.

## Acceptance and future evaluation

Before claiming implementation complete, verify these behaviors:

1. Export opens the correct task with recognizable content and no capture takeover.
2. One Download request prepares and starts the correct file download.
3. Cancel/close prevents delayed delivery; reopening has usable settings.
4. Settings/source changes invalidate obsolete prepared results correctly.
5. Copy link works from one click with inline feedback and no video render.
6. Card downloads and in-app sequence sending remain reachable.
7. Unsupported native sharing has a usable alternative; file transfer only uploads
   after an explicit request. No verification messages go to real recipients.
8. Social caption/account controls are absent from the download task.
9. Inspect the real route at 375x667, 960x412, 820x1180, 1440x900, 1920x1080,
   2560x1440, and 3840x2160, plus 200% reflow and reduced motion. Verify expanded
   settings and both unprepared/completed media states.

For later user testing, give people uncoached tasks: download an animation, copy
its link, send a sequence to a friend, and move a video to their phone. Observe
first actions, uncertainty about the payload/destination, wrong turns, completion,
and cancellation recovery. Compare against the previous experience. Browser tests
can establish functionality and geometry; they cannot establish that no human
will ever hesitate. Record real user evidence separately from design assumptions.

### September 20 implementation evidence

The three-destination implementation was exercised against the public sequence
viewer and a development-only host for the production video exporter. The latter
is `/test/post-share-sheet?real-video&artifact=video&open`; it loads a real public
16-step sequence and uses `SequenceModalExporter`, rather than a simulated blob.
It prevents short-link creation in that mode. Keep it development-only.

- One Download action rendered an 18-second playable MP4 at 720p/30 fps and
  initiated the browser download after blob hydration. Browser download events
  confirmed completion of a 1,727,804-byte file. Changing resolution marked it
  stale. Cancellation and an injected renderer failure restored usable controls;
  retry completed a real download.
- The actual viewer's Export Animation entered Download directly without capture.
  Copy link produced inline `Link copied` after one activation. Tunnel and 3D
  sharing used captures of their mounted sources. Account requirements remained
  visible before file preparation; testing did not create an account.
- Unprepared and completed download layouts were checked at all seven CSS
  viewport tiers above. No horizontal overflow was measured. Desktop tiers
  from 1440x900 through 3840x2160 needed no internal scrolling. The small phone
  fit its unexpanded controls; expanded controls and short landscape used one
  content scroll region while retaining the primary action. Reflow was checked
  at 960x540 CSS pixels (the effective space of 1920x1080 at 200%); this was
  viewport emulation, not a claim of a native browser zoom test. Reduced-motion
  emulation reached the same controls with effectively zero transition duration.
- Sixteen focused tests passed across `video-download-intent.test.ts`,
  `viewer-shell-share-state.test.ts`, and
  `export-coordinator-scene-take-lifecycle.test.ts`.
- Independent review found and closed three lifecycle hazards: resuming the
  sheet during asynchronous 3D recipe persistence, treating a newly rendered
  output URL as a changed input, and hiding composition when direct publishing
  is unavailable. Live render output must never invalidate its own request.
  Only precomposed Post Studio files use their existing URL as source identity.

No social post, message to a real recipient, account connection, phone upload,
or completed 3D recipe save was performed as verification. The delayed 3D save
and cancel race is covered by a controlled regression test. These checks establish
behavior and layout, not uncoached user-task success or subjective satisfaction.
