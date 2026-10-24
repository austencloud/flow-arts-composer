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
  action. Sending through Flow Arts Composer happens in the viewer's share
  panel without rendering a file.
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

### October 21: the card shares and downloads in one tap

Austen tested Share on his phone with the Card view showing and wanted to send
the card to Instagram. Share opened the panel (Download, Copy link, Embed, a
recipients picker with empty space), and Download card then opened a second
screen asking for file type and card settings. His words: "If I click
download card, obviously I just want to download the card," and Share
"should just share that card that I'm looking at right now, open up a native
share sheet with the card ready, go."

- On a phone (`detectPlatform() !== "desktop"` with native file sharing),
  header Share on the Card view opens the system share sheet with the card PNG.
  No panel. The card is drawn ahead while the Card view is up, because a
  browser share sheet only opens inside the tap that asked for it. If the sheet
  cannot open, the panel opens as the fallback.
- Download card, from the panel on any device, hands over the card file at
  once: share sheet on a phone, straight to disk on a desktop. It never opens
  the file-type and card-settings sheet; the card's settings are on the Card
  view itself.
- Desktop Share keeps the panel. Other views on a phone still open it for now.
- The Android app's WebView has no `navigator.share`. `shareBlobNatively`
  falls back to the app's `TkaFileShare` plugin, which writes the file to the
  app cache and opens Android's chooser through the existing FileProvider.

### Entry context determines the initial task

| Entry                | Initial presentation                                                           | Primary result                                                               |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Export animation     | Download animation, recognizable current-view preview, current output settings | Prepare if necessary, then download the video                                |
| Export card          | Download card, card preview and card-specific settings                         | Download the displayed card                                                  |
| Share (viewer)       | Share panel beside the live stage; on a phone's Card view, the system sheet    | Copy its link, send a sequence attachment, or enter contextual file download |
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
- Download card from the viewer does not open this sheet (see October 21).
  Where the sheet still prepares a card, a Card settings summary (theme and
  footer) opens the full card editor that the viewer's Card tab uses.
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
- A sent sequence carries the sender's view, not just the sequence. When the
  person presses Send, the viewer's state is read the way Copy link builds a
  link (`extractViewerStateQuery` over `getShareUrl()`: the `pane`, `split`,
  `fx`, `cols`, and `s` names) and rides on the attachment as
  `metadata.sequenceViewParams`, additive to the existing sequence metadata.
  It is read at Send, not when the panel opened: the panel stays open while
  the person changes views, so the message means what the stage showed when
  they sent it. Opening the attachment seeds the recipient's viewer with that query
  before it mounts (`sequence-viewer-overlay-state`'s `seedViewerStateParams`),
  the same override path a followed share link takes, so they land on the
  sender's pane, effects, and visibility as a view-only override of their own
  saved values — which `closeSequenceOverlay` strips again on exit. The plain
  `/q/<code>` link carries the same query so an out-of-app open matches; scan
  handoff already forwards its query to the viewer. Absent on messages sent
  before the field existed, which simply open on the recipient's defaults.
- In the viewer, Share is not a dialog. It toggles a share panel in the
  inspector track beside the live stage, the way the Export page sits there.
  The rail item the person has selected is what gets shared; the panel names
  it and follows rail changes while it stays open. Download leads the panel,
  named for that subject (Card image, Video, Post video); under it sit Copy
  link, Other apps for the system share sheet where the browser supports it,
  Publish in development builds, and Send to a friend. Send to a friend is a
  choice like the others, not an open list: pressing it swaps the panel to a
  flat people list with Back, and the stage stays in view. Recents load only
  then. On a phone the dock fits the choices and takes its full height only
  for the people list.
  On the 2D animation Download renders at once (see below). Elsewhere
  Download and Publish open the file sheet directly at that task, not at its
  chooser, and the panel is still there when the sheet closes. Share again,
  the close button, or Escape closes the panel.
- Sending to a friend in Flow Arts Composer uses the existing sequence-attachment
  workflow; it is not a social publishing operation. In the viewer it lives in
  the share panel, not in the file sheet. Choosing who must not change what, so
  the card settings stay on the Card pane. A guest sees a sign-up prompt in
  place of recipients; after sign-up the recipients appear without reopening.
  After a send the panel stays on the people list with fresh recipients; Back,
  closing the panel, or Escape leaves it. The inbox drawer
  keeps its own send sheet for shares that start inside the inbox, and Create's
  share sheet keeps its Send to a friend entry.
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

### Prop artwork on cards (September 27)

A card image someone saves or shares draws the prop look they chose, Realistic
or Pictograph, so the file matches the card and canvas they were looking at.
The triangle grip follows the look: a side-grip player's cards draw the side
grip, in either look. Printed cards and the card a scan opens stay notation
artwork, with the triangle on its corner glyph. A printed card is one shared
object: its cloud cells are rendered once, verified before a QR is issued, and
downloaded by every scanner, so a personal look cannot enter them. The fan
build already followed this split.

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
  are presentation only. In the viewer, `ViewerSharePanel.svelte` is the
  `share` inspector profile: the stage keeps the live view the person chose
  (the rail stays usable) and the panel takes the inspector track, docking
  under the stage where the track stacks. `viewer-shell-share-state` owns the
  panel's open state, whether it shows the people list, and its
  `SequenceSendSession`. The viewer passes `compact` to the picker, which drops
  its heading, box and inner scroller; the inbox sheet keeps them. No card is rendered for
  the sender; the recipient still receives the sequence and its thumbnail. The outbox is the drawer's; hosts that mount the drawer lazily
  mount it on `inboxState.hostRequested`, and the workspace reads the
  registered outbox from `message-delivery-context.ts`. The sender's view
  travels with the send: `send-attachment-state` reads it through
  `getSequenceViewParams` when Send is pressed, passes it to
  `buildSequenceMessageAttachment`, and `SequenceMessageCard` hands it back to
  `openSequenceViewer` for the recipient.
- Existing post composition and publishing components remain their respective
  owners. Do not introduce a second renderer, modal stack, or delivery service.

### Guest file requests

Guests can open the download task, adjust settings, and see the preview, but
saving a video or card requires a full account. The dock replaces the Download
button with a one-line note and a `Create free account` action. The sheet closes
before the auth drawer opens because auth drawers paint beneath the share sheet
and the sheet makes the page inert. Copy link, in-app sending, and native
sharing stay available to guests. In Create, Copy link carries the current
unsaved sequence and tempo in an inline viewer URL; signed-in sharing can
mint a short link on demand. The Publish route shows the same gate before
any media is prepared and does not create a short link for guests. A
viewer that refuses to render reports as a
failure, not a cancel; cancel is reserved for the user's own action. When the
clipboard API is denied, copy link falls back to selection copy and, if that
also fails, reveals the link in a selectable field.

### Downloading the animation from the viewer

Share is the only way to download the 2D sequence animation. The share
panel's Download renders at once with the Export page's settings, names what
it will make (resolution, fps, loops, and the expected render time), and
carries the render's progress; its Settings button opens the Export page. The
page holds the settings only: the stage keeps playing beside it (the same shape
as the share panel) and they stack in one column with chips for every choice,
but it has no render button of its own, so the file cannot come out of two
different flows. The share sheet's Video choice closes the sheet and
returns to the share panel on the animation, the way Post Studio takes over
from the sheet; the sheet's own download route
keeps Card, plus Video for hosts with their own exporters (Mandala, Tunnel,
Post Studio renders), where the file type is a chip row. The viewer
never mounts a second animation engine behind its share sheet: a frozen capture
behind a modal was the reason the download moved. The Create workspace has a
static card behind sharing, so its download sheet supplies its own live preview
using the existing inline animation player.

### Filming the 3D scene

A 3D video is a performance, not a render: the camera moves live while the
person watches, so it is filmed where they are looking. The stage holds the
only Record control, a red button with a Free/Orbit segmented choice for the
camera beside it. The quality (Draft, Final, Cinema) is picked once, on the
card that appears after Stop; the recording is already saved by then, so
backing out costs nothing. Share never starts a take. In 3D the share
panel's Download hands over the newest film kept on the device for this
sequence, named `Download film` with its length, frame, and rate on the line
beneath and `New take` beside them. With no film yet it reads
`Record a take` and returns the person to the stage. Publish from 3D opens the
card sheet. The earlier pattern, where the share sheet hid itself during a
take and resumed afterward, is retired: it showed a hung "Rendering video..."
over a scene the person could neither see nor stop.

### The image a clip opens with

Players and file thumbnails show a video's first frame, so the Export page
lets the person choose it. A chip row labelled `Opens` offers three choices:
`First beat` (the sequence's start position), `Current frame` (whatever the
live stage shows when Download is pressed; pause where it looks right), and
`Mandala` (the sequence's mandala fingerprint, drawn in the account's hand
colours like the card back, with a thumbnail under the row). The choice
persists with the other video settings. `First beat` adds nothing, because
the export already opens with one beat of the start position. The other two
prepend a one-beat hold of the chosen image at the export speed, drawn
contain-fit over black at output resolution, before the animation. The export
captures the image itself as the render starts; a share sheet that owns a
render still hands its own capture with the request. The row is hidden for
hosts whose render cannot open on a chosen image (3D takes, art views, Post
Studio renders). When an opener applies, the Instagram cover points at time
zero unless the person picked a cover frame explicitly.

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

### September 20 card preview correction

Austen's subsequent card screenshot exposed a gap in the preceding verification:
the desktop video layout passed, but the card still inherited the video's
384-pixel stage cap. `object-fit: contain` preserved the card's proportions by
shrinking it inside a much wider box. Card settings also started collapsed at
every viewport size; only video settings had automatic desktop expansion.

The download card now uses its intrinsic image ratio and the full preview-column
width. Exceptionally tall cards are contained by the space remaining in the
viewport after the sheet header, toolbar, padding, and download dock. Do not
reintroduce a fixed video-height limit or a percentage-of-screen limit for cards.
At least 900 CSS pixels wide and 760 high, card settings appear directly beside
the preview. Narrow or short windows retain the disclosure. Use CSS viewport
dimensions, since a physical 4K monitor may present a smaller scaled viewport.

There are separate contributors to first-image latency:

- The header renderer previously waited for the complete glyph library before
  drawing a single word. Its word-scoped path now uses the existing glyph cache
  and tokenizer to prepare only the actual header symbols, including Greek and
  dashed letters. Later words must still load their missing symbols. Full-library
  preload remains available to worker setup and background warming.
- QR generation can wait for canonical cells in both themes and a short link
  before the final PNG is returned. This is a readiness contract for the person
  scanning the printed card. Do not silently remove it to make a timing claim.
  The prepared QR cache already avoids that work on a repeat request.

A cold development preview was observed still preparing after 16 seconds; that
run did not have phase instrumentation, so its delay cannot be assigned wholly
to either cause. A subsequent instrumented warm 16-step render completed its
composition in 335 ms, with cell drawing finished at 314 ms. This is diagnostic
evidence, not a cold-render speed guarantee. Temporary instrumentation was removed.

Verification covered card previews at all seven viewport tiers, wide and tall
column layouts, manual phone disclosure, and automatic desktop expansion. At
3840x2160 the 16-step card used the full 640-pixel inner preview width with no
content scrollbar. At 1920x1080 the final content region measured identical
client and scroll heights; short windows used the existing single scrolling
body and fixed download dock. Reflow at 960x540 and reduced-motion disclosure
were also checked. Nineteen focused glyph/header tests passed, including later
words and worker-seeded bitmap caches, which must not access browser-only loaders.

### September 21 QR reuse and measured image preparation

The existing QR bake was not enough to guarantee export reuse. The card exporter
uses 240-pixel cells with a 214-pixel QR slot, while prepared SVGs were baked at
200 pixels. Size participates in the prepared-artwork key, so export could miss
a perfectly usable vector image. Sequence QR generation now requests and
prepares the canonical 200-pixel SVG; each canvas draws it at its actual slot size.
The existing keys remain valid. Content, rendering revision, props, theme, style,
icon, and link destination still invalidate the corresponding preparation.
URL-only QR generation retains its requested dimensions.

Matching requests without an abort signal share in-flight preparation. Requests
with cancellation retain their own work and stop before further preparation or
short-code creation. A rejected preparation is not retained as a reusable result.

`CardExportTrace` records local, request-scoped timing through the existing
Sharer, SequenceRenderer, ImageComposer, and QR generator. It is enabled in local
development; production diagnostics can be enabled with `profileCard=1` in the
page URL. Console entries begin with `[Card export timing]`. Start entries show
the active stage during a stall; the final JSON report includes wall-clock total,
phase timings, cache outcome, step count, and output bytes. It records no sequence
text, links, cache keys, or account data and sends no telemetry. Nested spans may
overlap: use the report's total, never the sum of phase durations. A swallowed QR
failure is flagged as `qrFailed` rather than appearing to be a successful QR.

Ownership search covered timing, profiling, measurements, and concurrency. The
existing boot profiler measures app startup and the animation export tracker
estimates video encoding; neither owns card preparation. The new trace owns only
one diagnostic request. The existing canonical cell warmer remains the owner of
scan readiness, including its bounded foreground scheduling; no second image
renderer or cloud cache was introduced.

The actual 16-step card in `/test/post-share-sheet?card&open&profileCard=1`
reproduced a **29,046 ms** creation wait with a prepared-QR miss. Drawing its 17
pictograph cells took **273 ms**, fonts **27 ms**, and PNG encoding **49 ms**.
Dark and light scan readiness consumed **11,396 ms** and **16,691 ms** respectively.
SVG generation itself took **15 ms**. After a page reload with that prepared QR
available, the complete card took **298 ms**, including a **2.9 ms** prepared lookup.
The latter is a reuse result, not a first-ever sequence speed guarantee.

A read-only network experiment checked the same 34 published scan assets with
`no-store` requests: serial reads took **8,367 ms**, and four concurrent reads took
**1,818 ms**, with every request succeeding. This measures asset checks, not an
entire cold export; request order and network conditions can affect the result.
The recorded payload totals varied slightly between passes, so this is not a
byte-identical throughput benchmark. The evidence supports two bounded changes:
foreground QR preparation checks existing public assets before rendering and
uploading them, and processes up to four cells at a time. Background callers keep
their serial behavior. A truly missing object still has to be prepared and
successfully uploaded before its QR is ready. Genuine missing objects may now
produce a 404 during that foreground lookup; this is an expected cache miss.

The implemented foreground warmer was then exercised directly against those
published cells after resetting only the task browser's canonical-cell readiness
caches. It verified all **34 cells in 2,128 ms**, with **34 remote hits and zero
render/upload fallbacks**. This demonstrates reuse from a browser without local
proof. It does not measure generating genuinely new, unpublished cells.

Raw timing evidence is retained in
[`card-export-timing-2026-09-21.json`](../research/card-export-timing-2026-09-21.json).
These are local Chromium/Vite measurements on one real published sequence. They
identify the observed bottleneck; they do not establish a universal latency bound.

Focused verification passed 57 tests covering canonical QR reuse, concurrent
requests, cancellation, foreground limits, background serial behavior, failed
publication, library warm compatibility, card-cache invalidation, card settings,
and trace isolation. The final rendered card was inspected in the browser with
the reused QR present. Layout and output settings were not changed by this work.

### September 21 stale card during sequence changes

Austen reported that generating another sequence and reopening Download card
showed the previous card for four or five seconds. This was a preview lifecycle
defect, separate from QR preparation latency. The shared card-preview state kept
its previous URL and downloadable blob until the replacement render completed.
Its loading state also treated any retained URL as ready.

The actual Create → Generate → Share → Download card flow reproduced this with
two generated sequences. Holding the second real render at the Sharer boundary
left the first image visible under the second sequence's heading; Share card
and Send to phone also remained available. This check used the agent browser's
local settings with QR disabled to isolate preview ownership from network work.

A prepared preview belongs to its sequence content and complete render settings.
When those inputs change, the old image and file must stop being exposed
immediately, before the replacement request completes. A late result from an
obsolete request must never become the current preview or downloadable file.
Reopening an unchanged card may still reuse matching prepared artwork.

The fix extends `createCardPreviewState`, shared by the download sheet and Post
Studio. It snapshots the requested sequence, gates all exposed artifact data on
the current content/settings identity, and checks that identity again when an
asynchronous render completes. Reset retires pending results as well as the
displayed artifact. Prepared QR and card-blob caches retain their existing owners.

Browser verification repeated the actual Generate flow with held real card
results. The replacement showed preparation with zero old preview images and
no old-file handoff actions after more than eight seconds. An obsolete result
released before the current result did not appear; another obsolete result
released afterward did not replace the current image. Closing and reopening the
unchanged card reused the same preview URL without another render request.
These checks prove preview ownership, not reduced image-generation latency.

### September 21 live card preview and background file preparation

Austen requested the real, assembled ChoreoCard in Download card while its PNG
prepares. The visible card must not depend on completing the file, and must not
switch to a raster image when preparation finishes. QR readiness may still take
time; its reserved cell can prepare independently of the rest of the preview.
This changes when the person can see and edit the card, not the scan-readiness
requirements of a downloaded QR code.

`LiveExportCard` adapts the sequence viewer's actual `ChoreoCard`; it is not a
second card renderer. `createCardPreviewState.request` exposes the current
sequence and resolved export-option snapshot before a blob exists. Both the live
component and Sharer consume that snapshot. Complete visibility overrides keep
an asynchronous export from reading a later set of global display settings.
Viewer-only selection and playback decorations are excluded from export
presentation.

Auto layout is resolved by the mounted live card. The file receives that exact
column/start-placement decision after the live card has had an initial paint.
It must not independently choose a layout from a different container. Source
changes invalidate the resolved layout as well as any pending file delivery.

Download remains an explicit user action. While the PNG is preparing, the first
Download click records an intent for the current card revision. Completion may
deliver that revision once. Closing the sheet, leaving its file route, changing
the sequence, or changing settings retires the intent. A failed file preparation
keeps the live card visible and permits retry. Native sharing keeps its existing
user-gesture requirements; this download behavior must not auto-open a system
share chooser after a long asynchronous render.

Parity must compare the mounted live DOM with its actual composed PNG. The
existing browser-to-MCP PNG comparison does not cover this boundary. Tests must
use the same real sequence, option snapshot, and resolved geometry on both
sides, wait for their assets, and compare header, pictograph body, and footer
regions. A deliberately missing meaningful element must fail the check. Do not
make a visible discrepancy pass by widening image-difference tolerances.

The live card's containment is not an input to Auto. Use the available stage
width/height to select a layout, and derive its intrinsic aspect from the shared
card geometry. Feeding the already-contained dimensions back into that choice
caused repeated ResizeObserver notifications and stalled file preparation.
The initial readiness signal waits for the real pictograph SVGs to mount and
paint; it does not wait for QR resolution or restart for each fractional sizing
adjustment. A new source remounts the card and retires that signal.

The narrow sheet needs an explicit stage height cap before the file is ready.
Using the full viewport as Auto's available height selected a tall arrangement
that then shrank into the short phone preview. The real Generate flow reproduced
an eight-step card only 66px wide inside a 334px stage at 375×667. With the stage
cap supplied to Auto, the same card occupies the available 309px content width.
Pinned layouts still remain pinned and contain the complete card.

The first Auto measurement completes the initial choice; it is not a user edit.
An immediate Download click must survive that settlement. Once the initial card
is ready, layout/settings changes cancel a pending download as usual. The real
sheet regression clicks before waiting for pictographs or a PNG request, because
a browser automation stability wait can otherwise hide this timing defect.

Export presentation retains real SVG pictograph cells. Its header, footer, step
labels, and mandala use the same small drawing primitives as the PNG, avoiding separate
font metrics and gradient implementations. This does not replace the assembled
card with a PNG or turn pictographs into bitmap cells. QR source resolution and
placement also follow the shared composition rules; the ordinary viewer keeps
its existing presentation. The tests caught a smaller live QR source and a
different inset that a full-card similarity score would have concealed.

Cell separators must overlay the artwork, as they do in PNG composition. A
layout-consuming border reduced a nominal 300px cell's live artwork to 298px.
Export presentation uses a full-size cell with an overlaid separator; ordinary
viewer styling is unchanged. The strict live comparison caught this discrepancy.

Regression coverage includes the actual download sheet with its real pictographs:
an explicit click during preparation, pinned/Auto round trips, replacement of a
sequence while an old PNG is pending, retry after failure, and containment at
phone/tablet sizes. A separate held-QR test proves the rest of the card can become
ready independently. These checks supplement the snapshot/cache tests; a card
tested alone did not catch the interaction between its geometry and the sheet.

Local browser verification held actual Sharer results after PNG preparation.
The live card was already mounted before the request, a queued click downloaded
once, and closing/switching sequences retired old delivery intent. In this warm
local session with QR disabled, 16-step PNG preparation took roughly 240–350 ms;
matching cached requests took roughly 3–4 ms. This is not a cold-start or QR
publication benchmark. Existing stage timing instrumentation and the earlier QR
reuse measurements remain the owners of that separate performance question.

Final verification on September 21 passed the complete package verification
gate: 20 browser/source/installed-MCP comparisons, 13 live-card parity checks
including negative controls, eight actual-sheet lifecycle checks, and the
held-QR readiness check. The 39 focused logic tests and six browser preview-state
tests also passed. Regional image tolerances were not widened. The real Generate
flow was inspected at phone, tablet, short landscape, desktop, and 4K viewport
sizes; desktop settings opened automatically and the large desktop layouts had
no unnecessary inner scrollbar. CI retains live/export/difference images so a
future regression can be investigated without rebuilding this evidence manually.

### September 21 sharing motion audit

Austen reported that the File type selector abruptly changed the modal's height
between Card and Video. The previous acceptance checks established the final
layouts and file lifecycle, but did not measure the intervening frames. The
baseline browser trace changed from approximately 846px to 416px in a single
frame. A CSS height transition on an unchanged `fit-content` declaration did
not cover intrinsic content changes.

The audit covers this sheet's Home, Link, Download, phone-transfer, publishing,
and Instagram review states, plus the card/video settings they expose. It does
not certify the separate Post Studio editor or external operating-system and
social-network interfaces.

| State change                                                                                       | Motion or stability owner                                            |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Dialog changes natural height                                                                      | `BaseModal.animateSize` and shared `createIntrinsicHeightMotion`     |
| Home / Link / Download / Publish and phone-transfer route                                          | Shared `Crossfade` for content; `BaseModal` owns frame height        |
| Card / Video settings                                                                              | Shared `Crossfade`; live card settings do not key the heavy renderer |
| Disclosure, custom footer, start-placement choices, stale/render/error status and delivery actions | Shared `growFade` for normal-flow presence                           |
| Header title and download action label changes                                                     | Reserved geometry so copy does not push neighbouring controls        |
| Review detail and recovery rows                                                                    | Shared `growFade`                                                    |

An outgoing layer remains visible while fading, but must immediately become
inert and hidden from assistive technology. Rapid reversal must leave one
interactive branch. Preserve the live card's intrinsic stage sizing and its
readiness signal: wrapping it in an absolutely positioned or height-pinned
crossfade can stop PNG preparation even when the final screenshot looks
plausible. The real-card lifecycle tests caught that failure during this audit.

Treat nested motion as an integration problem. Animating the settings column
does not establish that the taller preview column or modal frame animates.
Checking for _any_ descendant animation is not a valid reason to skip the
frame: a spinner, an opacity fade, or a small status row may be unrelated to
the dimension that changes. Likewise, constraining an updated target to the
last few milliseconds of an earlier transition can produce a large late jump.

New transition checks must sample the actual sheet after native input, including
Card to Video, reversal, and reduced motion. Keep the existing immediate-click,
source replacement, retry, and Auto-layout tests. At short landscape sizes,
assert the download dock remains inside the dialog and reachable; adding a
crossfade wrapper must not break the scroll area's flex constraint. Final
screenshots and tests that merely intercept `animate()` calls are insufficient.

The frame retains its measured height between observations. Its nonshrinking
content wrapper provides the next natural size independently. Releasing the
frame to `auto` after every animation permits a first-frame reflow before the
next observer notification. Do not infer a destination by summing animated
descendants: columns, overlays, and viewport caps invalidate that arithmetic.
The outer route Crossfades must not pin height or measure against their own
previous height; keep their flex/scroll constraints and let the dialog own it.

Verification for this audit: 12 actual-sheet browser regressions, 16 shared
modal/Crossfade browser checks, and 35 focused sharing/motion logic tests pass.
The tests include immediate download intent, source replacement, PNG retry,
real pictographs, transition frame sampling, rapid reversals, inactive outgoing
controls, short-landscape scrolling, and both initial and live changes to Reduce
Motion. The initial source checks alone did not establish these behaviors.

Browser inspection covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
2560×1440, and 3840×2160, plus 720×450 for 200% desktop reflow. Download actions
remain visible; only constrained heights need a content scrollbar. At the large
desktop sizes neither Card nor Video has an unnecessary inner scrollbar. The
mobile Instagram Preview/Details switch keeps media mounted, fades the panes,
and makes the inactive pane inert. Publishing/phone-transfer completion was not
performed against a real account or recipient.

Visual review: VR-1, evidence ledger checked 2026-09-21, calibration **NOT
CALIBRATED**. Audience: a creator saving or sharing the current sequence. Owner
constraint: smooth, consistent transitions without blank space or inaccessible
controls. This is a motion repair within the existing composition, not a new
visual design. Independent code review found the live Reduce Motion cancellation
gap; its fix has a browser regression. Aesthetic inspection is **self-review —
less independent**. Project specificity, hierarchy, grouping, real artifacts,
craft, and product continuity are supported by the inspected download and review
states: the current sequence remains the subject, the download action remains
distinct, settings stay adjacent on desktop, and motion uses shared primitives.
This is not a claim of universal aesthetic acceptance or external-app coverage.

Task-local frame traces, viewport geometry, browser captures, and test logs are
retained in `E:/tka-share-layout-motion-evidence`. Some captures from the in-app
browser have compositor cropping/scaling artifacts; geometry records and direct
interaction, rather than those image edges, establish viewport containment.

### September 21 workspace animation availability

The Create workspace opened `PostShareSheet` with `availableArtifacts: ["card"]`
and no video callbacks. Its home action promised a video or card image, but
Download a file had no File type selector. Viewer-only acceptance checks missed
this entry-point difference.

The workspace must offer Card and Video in the existing sheet. It composes
`SequenceModalExporter` and the canonical offscreen `VideoExportOrchestrator`
with an independent playback controller and an ephemeral panel state. A sizing
canvas supplies the existing export layout calculation; it does not mount a
second live renderer or open the full sequence viewer behind the dialog. Shared
export settings continue to own resolution, frame rate, and repeat count.

Opening sharing or selecting Video must not start rendering. Only an explicit
download/render action may load the export runtime and prepare the file. That
request owns its sequence snapshot, progress, cancellation, and blob lifetime.
Closing, replacing the sequence, or canceling during lazy startup must retire
the request before it can render or deliver an old file. The isolated controller
must not change the workspace playhead or persisted playback preferences.

Verify this through the workspace Share button as well as the viewer entry:
choose Download a file, switch both file types, change video settings, download
an animation, cancel and retry, then replace the sequence and reopen sharing.
Showing a Video option without a working renderer is not acceptance.

### September 22 workspace preview completion

The first workspace repair verified rendering and delivery but left text where
the live animation belonged. Austen rejected that result. A successful encoder
test is not evidence that the pre-download experience is complete.

Selecting Video must show the current sequence moving before any export starts.
The existing `InlineAnimationPlayer` owns playback and canvas rendering; the
workspace supplies it to the share sheet's preview slot. Its state must be local
to the preview, use the export's tempo and presentation settings, and stop when
the person leaves Video or closes sharing. Progress and cancellation must not
remount it. The finished file replaces the player in the same reserved media
area through the shared transition primitive.

Acceptance requires observing actual animation frames before pressing Download,
then a playable downloaded file. Check both directions of Card/Video switching,
close/reopen, cancellation, and a replacement sequence. A placeholder, spinner,
static frame, or test that mocks the player cannot establish this behavior.

### September 22 card dialog clipping regression

The live development server returned raw Svelte component source inside the
`BaseModal` stylesheet response. The browser discarded its uncompiled `:global`
selectors, including the intrinsic wrapper's `flex: 0 0 auto` rule. The wrapper
then shrank to the sharing menu's retained height, so `ResizeObserver` could not
detect the larger card view. The card and download footer extended below the
dialog's clipped edge. A page reload did not repair the server's cached response.

The same components worked in Vitest's independent Vite instance. Changing the
share sheet's percentage height was investigated and rejected: `ShareSheetFrame`
already overrides it with natural sizing. Do not mask a malformed stylesheet
with feature-local sizing rules or descendant-height arithmetic.

When the live route and browser component tests disagree, inspect the loaded
stylesheet and computed wrapper flex before changing layout. Run
`node scripts/verify-dev-styles.mjs` against the existing local server to detect
raw component source in the layout, modal, and sharing styles. This probe does
not start or restart a server. Follow the server ownership rule for recovery.

Regression verification must start with the settled sharing menu, then open
Download a file and switch Card/Video in both directions. Check the footer and
complete preview against the dialog bounds, including small landscape and a
large desktop viewport. A smooth height animation alone does not establish
that its destination contains the content.

### October 18 one split shell for Home and Download

Austen kept the animated preview and the three choices (Copy link, Download a
file, Publish socially) and rejected the layout around them: large blank areas
beside the actions, 12px text, dense Download settings, no transition from Share
to Download, and an unpolished Card to Video change. This record covers the
implementation. It was written without a browser pass; verification is owed by
the integrating task and is listed below.

**Shell.** Home and Download are one split layout (`.share-split` in
`PostShareSheet`). The stage holds the artwork and persists across both routes;
only the rail beside it swaps (`Crossfade` keyed on the route, swap/step). The
dock exists on Download only and enters with `growFade`. Publish stays a single
column inside the same dialog. Below 900 CSS pixels the split stacks: the stage
appears on Download only, entering with `growFade`, and the rail scrolls under
it with the dock pinned.

**Refinement of the persistent-stage plan.** The stage persists across Home and
Download at 900px and wider. On narrow screens Home shows the choices only and
the stage appears when Download opens, because a 36dvh stage above three 6rem
choices would push the choices below the fold on 375×667. The stage Crossfade (key = media kind) is a
plain stack with no `fill` and no `animateHeight`: the stage height is a CSS
variable, so nothing waits on its own measurement.

**Sizing.** `--stage-h` is `clamp(11rem, 36dvh, 20rem)` below 900px. At 900px and
wider it is the viewport height minus 11rem, capped by `--stage-cap` (34rem;
42rem at 1680×1000 and up; 54rem at 2600×1600 and up). The cap is composition:
a larger canvas shows a larger artifact, while buttons, labels and settings keep
their logical size. The rail is a 20–24rem column whose height equals the stage
(`contain: size`), so its content scrolls inside it and never grows the dialog.
Short landscape (900px+ wide, under 560px high) widens the rail to 26–30rem and
lays the choices in two columns. Dialog width is one value for Home, Download and
Publish (63rem; 71rem and 83rem at the two large tiers), so moving between them
never resizes the dialog sideways. The phone-transfer QR keeps its narrow dialog.

**Type and targets.** Choice labels are 16px, hints and settings labels 14px,
icon tiles and every control 44px or more. The 12px hint, status and link-reveal
text was raised to 14px. No edge strips, text links, checkboxes, raw durations or
`transition: all`.

**Card settings.** `ExportImagePanel` gained `grouping: "flat" | "share"`
(default `"flat"`). `"share"` renders four disclosure groups — Look, Header,
Pictograph, Layout — built from `SegmentedControl`, `FilterChipBase` and
`PanelButton`. Look is open by default and holds the theme control and the footer
editor. Collapsed groups show their current values as a one-line summary. Every
capability of the flat panel is reachable; none is hidden. Only
`PostShareSheet` passes `"share"`; `SequenceViewerShell`, `PostCardAppearanceTool`
and the test harness keep the flat panel. The flat panel's master section toggles
(`toggleHeader`, `togglePictograph`) are not carried into the grouped panel;
each option is reachable individually. Video settings use the same grammar: a 14px
label over its control, 44px stepper keys.

**Live card contract (unchanged).** `LiveExportCard` measures `host.parentElement`.
That parent is now `.card-host`, a grid box with an explicit `max-height` equal to
the stage minus its padding and border, so the card measures a real, capped box
before the PNG exists. Its `onReady` lifecycle, the source-key remount, and the
card and video download-intent handlers were not modified. Do not wrap the card
in `fill`, `animateHeight` or an absolutely positioned layer.

**Not changed.** The `WorkspaceShareSheet` runtime-motion renderer, export
engines, capability APIs, QR, media editing, native share, phone transfer,
publishing gates and the fullscreen Instagram review.

**Superseded by the October 18 correction pass below:** the phone-Home note under
"Refinement", the `--stage-cap` values and dialog widths under "Sizing", the
short-landscape two-column choices, the stage padding, and the Download toolbar.

**Verification owed (not performed in this change).** Run
`tests/render-parity/download-card-lifecycle.test.ts`, `ShareButton.svelte.test.ts`,
`card-preview-state.svelte.test.ts`, `post-share-draft-state.test.ts` and the
card/video download-intent tests. Inspect `/test/post-share-sheet?real-video&artifact=video&open`
and the viewer and workspace entries at the seven viewport tiers plus 200% zoom:
no horizontal overflow, the dock reachable at 960×412 and 375×667, the Home to
Download and Card to Video transitions observed mid-flight and reversed, reduced
motion instant, outgoing branches inert, and focus landing sensibly after each
route change. Run Prettier on the three changed Svelte files.

### October 18 correction pass 1

An independent review of the rendered frames found seven material defects. Each
decision below answers one; none adds a description or data panel.

- **One preview tile.** The stage has no padding of its own on any route and the
  animation fills it edge to edge, so the Share and Video animation sit at the
  same pixels and the change between them is a pure crossfade. The live card keeps
  its breathing room inside `.card-host` (0.75rem each side) instead of in the
  stage, so the stage box never changes when the key does. The earlier 0.5rem
  Video inset (`live-video-stage`) is gone.
- **Download top.** "Back to sharing" is a 44px arrow button in the header, left
  of the title, with the same accessible name (`share_back`). The title for video
  is `share_download_video`. The File type label is removed; the Card/Video switch
  is a full-width two-part control named by `aria-label` (`share_file_type`).
  The "Card settings" and "Video settings" headings on roomy sheets are removed;
  the Look/Header/Pictograph/Layout titles and the video control labels are the
  headings. Narrow sheets keep their disclosure buttons.
- **Fewer outlines.** At 900px and wider the rail has no outline; the stage and the
  choices are the outlined surfaces. The footer editor uses `layout="inline"` (its
  label and switch on one row, no subtitle) and loses its own box inside the Look
  group, so a group has at most one outline of its own.
- **No dead space.** The rail body is content-sized and the Download dock follows
  the last control, so the primary button sits near the settings and the column
  reads top-aligned like Home. Nothing was added to fill the space.
- **Theme switch.** Light and Dark carry icon and word and size to their content.
- **Short landscape (900px+ wide, under 560px high).** One column of compact rows
  (44px, 2rem icon). `--stage-h` is derived from the viewport so the stage, rail
  and dock fit without clipping. No grid. _Superseded in part by round 2: the
  hint wraps instead of ending in an ellipsis, and the stage is square._
- **Phone.** Home shows the live animation as a strip (7.5rem here; 11.5rem since
  round 2) above 4.5rem choices (two-line hints). Download grows the same stage to its working height with a
  `height` transition on `--transition-normal`; reduced motion is instant. The
  strip appears only when there is an animation or a still to show.
- **Wide canvases.** Caps and widths move together so the preview does not outrun
  the controls: dialog 63 / 69 / 79rem, stage cap 34 / 38 / 46rem, rail
  20–24 / 22–26 / 24–28rem at the base, 1680×1000 and 2600×1600 tiers. Controls
  keep their logical size.

**Verification owed.** Everything in the previous section, plus: the Home to
Video overlay (corner labels must not move), Card to Video crossfade box fixed,
the phone Home to Download height transition mid-flight and reversed, the header
back button focus order, and 3840×2160 stage-to-rail balance. No browser or test
run accompanied this change.

### October 18 correction pass 2

Root inspected the real guest Create flow. Each decision answers one finding.

- **Focus after Back.** The split shell no longer remounts the route, so leaving
  Download or Publish removed the focused arrow and left `document.body`
  focused. `returnToChooser` records the originating intent in a plain
  (non-reactive) variable; the Home intent button with that name claims focus
  from a `use:` action when it mounts, then clears it. Only the entering layer
  mounts it, so an outgoing (inert) layer cannot take focus later. Accessible
  names are unchanged ("Download a file", "Publish socially"). The value is
  reset when the sheet opens.
- **Frame widths.** `ShareSheetFrame`'s 1680 and 2600 width rules are scoped to
  the regular mode (`:not(--narrow):not(--expanded)`), so the QR and expanded
  widths win at every viewport. The phone bottom sheet is untouched.
- **Publish.** The container class is `publish-body`; the legacy `publish-route`
  button look (pointer, hover surface, fit-content) and the inline
  `back-to-chooser` button are gone. Back is the same header arrow as Download,
  shown when the sheet did not open straight into Publish. The container gets
  1.5rem/1.75rem padding at 900px and wider.
- **Account note.** `.account-note` carries a 0.75rem bottom margin in both the
  Download dock and Publish, so the note never sits against its action. No new
  wording.
- **Labels.** The frame's accessible dialog name for video is `share_download_video`,
  matching the visible title.
- **Types.** `stageKey` is declared after the values it reads. The resolution
  and frame-rate switches use string option values and convert to the numeric
  settings at the `exportOptions` boundary; the numeric settings and the shared
  `SegmentedControl` contract are unchanged.
- **Desktop Home (900px+, over 560px high).** The three choices share the stage's
  full height (equal rows), with a 1.125rem title, 0.9375rem hint and a 3.25rem
  icon tile, content centred in each card. Chosen over shrinking the preview,
  which would have changed the stage box between Home and Download. Download
  keeps its content-hugging rail. The viewer toolbar strip inside the live
  preview belongs to the viewer renderer and was left alone; no clean local
  mechanism exists to hide it.
- **Phone.** The Home strip is 11.5rem (184px), inside the 180–200px target.
  The live preview already fills its stage, so it follows the strip height.
- **Short landscape.** The stage column is `var(--stage-h)` wide, so the stage is
  square and the rail takes the rest of the width. Hints wrap instead of
  clipping. The stage box is the same on Home and Download, so Card and Video
  do not change it.

**Verification owed.** Focus on Home after Back from Download and from Publish
(keyboard and pointer); the equal-height cards at 1440×900, 1920×1080 and
3840×2160 (the percentage-height chain through the rail Crossfade layer has not
been observed); 375×667 with all three choices reachable without scrolling;
960×412 for the square stage and unclipped Copy link hint; guest Publish layout;
QR step width at 1920 and wider. No browser or test run accompanied this change.

#### Late review follow-up (same pass)

- **Guest Publish keeps the shell.** `publishGate` (publish route with posting
  unavailable or `needsAccountForFiles`) renders inside the Home/Download split:
  same dialog size, same stage and preview (the stage treats it as `home`
  through `splitRoute`), same header Back arrow. Only the rail's task changes to
  the note plus one full-width action. The real posting flow (`publishFlow`) is
  unchanged and keeps its own column, as do the QR step, services and auth
  gates. The unreachable gate branches were removed from that column. Back from
  the gate returns focus to "Publish socially".
- **Short landscape settings.** The measured state was scrollable, not
  unreachable: about 139px of rail for 459–532px of settings. Below 561px high
  the split now folds card and video settings into the same one-row disclosure
  (with its value summary) the phone uses, so file type, the disclosure and the
  download dock fit together; opening it scrolls the rail by choice.
- **Look children.** An open group's controls are indented on a whole-surface
  tint (no edge strip) so Theme and Card footer read as Look's children. The
  group summary has a 0.75rem lead so it no longer touches the title.
- **Not touched.** The faint circle in the phone card still is unconfirmed; the
  renderer was left alone.

### October 18 correction pass 3: direct settings, no accordions

Austen rejected the Download rail: "for some reason you felt it necessary to
create a scroll bar and put everything in the scroll bar section as expandable
collapsible items." The defect was structural. The rail was height-locked to
the stage, so the file switch, four group headers, an open Look group and the
dock overflowed it, and every ordinary setting sat behind a disclosure.

**Supersedes** the Look / Header / Pictograph / Layout groups with summaries
(one split shell section, "Card settings"), the "Look children" tint above,
and the phone and short-landscape settings disclosure (correction pass 2,
"Short landscape settings"; correction pass 1, narrow-sheet disclosure
buttons). Ordinary settings are never collapsed by default again.

- **Composition chosen.** Two were compared with the same controls. A:
  compact labeled rows in the existing rail, short controls beside their label
  (Theme, Card footer, Columns, Start, Info; Resolution, Frame rate, Quality,
  Repeats) and chip sets (Header, Pictograph) under theirs. B: a taller
  settings area beside or under the stage. B was rejected because it shrinks
  the preview or widens the rail past it. A keeps the preview dominant and
  adds no new chrome.
- **Rail height.** On Download at 900px and wider the rail is no longer held to
  the stage height. Home keeps the stage-height rail. When a sheet is too short,
  the rail body is the one scroll owner and the dock stays pinned beneath it.
  Nothing is hidden, clipped or shrunk to avoid the scrollbar. (The first
  version let the rail take whatever height its content needed; the browser
  showed that moved the shell, see Correction round 1 below.)
- **Label placement is the rail's call.** A container query on the settings
  moves a label above its control under 22rem of rail, and pairs rows in two
  columns at 36rem and wider (short landscape). Neither depends on the
  viewport, so the 1680 and 2600 seams still only recompose.
- **Same primitives, same owners.** `SegmentedControl`, `FilterChipBase` toggles
  and `CardFooterEditor` are unchanged; every setter and state owner is the one
  the Card tab already uses. The Card / Video switch and its `Crossfade` stay.
  Video settings follow the same row hierarchy, with 44px stepper keys.
- **Removed.** The `grouping="share"` disclosure groups and summaries in
  `ExportImagePanel`, and the `cardSettingsOpen`, `videoSettingsOpen` and
  `roomy*` disclosure state in `PostShareSheet`. The flat `inline`, `sidebar`
  and `bottom` layouts are untouched.

**Correction round 1 (same day, after the first browser look).** The browser
measured three defects in the first version, all now corrected in code:

- **The rail still scrolled at 1440×900.** Default Card rail body: client 635,
  scroll 656. Fix: on Download the rail is wider, `clamp(24rem, 31vw, 28rem)`
  (448px at 1440), so Header and Pictograph chips wrap into fewer rows. The QR
  note runs the full row width instead of the narrow control column, and Start
  no longer adds a second line. Stage and rail still compose without magnifying
  controls (4K rule); the wide tiers need no extra Download rule because 28rem
  is the cap.
- **Card and Video moved the whole shell about 91px.** Card's dialog was 852px
  tall at y24 and Video's 670px at y115, because the dialog is `fit-content` and
  the rail set its height. Fix: at 900px and wider the Download split has one
  height shared by both modes, `max(stage height, 46rem)` plus its padding.
  The dialog's own max-height trims it on a short window, so on any screen the
  dialog, the stage and the dock sit in the same place in both modes. The rail
  body takes the slack, so the action stays at the bottom of the rail and Video's
  shorter settings leave quiet space above it, not a moved shell. `Crossfade`
  with `animateHeight` still handles the rail contents; it cannot move the
  shell now. The QR step keeps its single content-sized column.
- **Start read as two things.** The Show chip sat on its own line above the
  Start label's selector. Fix: the label, the Show chip and the layout choice are
  one row. The choice takes the rest of the line (`growFade` on the x axis) and
  drops under the chip only when the rail cannot hold both; the label stays
  aligned with the first line.

Short landscape (900px wide, 560px tall or less) keeps its stage-width column
and now also holds the shared footprint, with the rail body as the one scroll
owner. Below 900px nothing changed in this round: the sheet is a single column
that scrolls once, with the dock pinned (round 2 below changes one band of it).

**Observed after round 1 (coordinator browser).** At 1440×900 every loaded Card
control, Card Share and the phone helper fit, rail client 635 and scroll 635
(no scrollbar), and the Card and Video dialog, stage and dock rectangles were
identical. 820×1180 fit with no scroll. 375×667 had one rail scroller (194px
tall) with the options reachable and the footer always visible. 1920×1080,
2560×1440 and 3840×2160 had no rail overflow. The Video header's Back button and
gap were confirmed normal (44px) in a settled screenshot; no header change.
Two things were not good enough: 960×412 was usable but cramped (one rail
scroller, 179px tall, about two rows visible), and 720×450 failed.

### October 18 correction round 2: short landscape and 200% reflow

**The failure.** The 720×450 viewport check exercises the reflow size of a
1440×900 window at 200% zoom; it did not change actual browser zoom. It is under 900px
wide, so it used the stacked phone layout: a 176px preview, the header and the
dock took the sheet, and the rail got 78px, enough for only the Card / Video
switch. Screenshot: `final-reflow-200.png` in the coordinator's temp folder.

**Choice.** Two options were compared: A, a compact landscape split that starts
below 900px; B, letting the preview scroll with the settings in one area. A was
chosen. The split shell already exists and already handles a 900px-wide short
window (960×412), so A reuses it instead of adding a second layout, keeps the
preview visible while the settings change, and keeps one scroll owner (the rail
body) with the dock pinned. B would scroll the preview off screen, which loses
the thing the settings change, and would need new markup and a second scroll
rule.

**Breakpoints.** The split shell now applies at `min-width: 900px`, or at
`min-width: 560px` and `max-height: 560px`. The stacked layout is
`max-width: 559px`, or `max-width: 899px` and `min-height: 561px`. The two
conditions cover the integer viewport sizes checked here. 560px is
chosen so a phone on its side (667×375 for an iPhone SE) joins the split while
a portrait phone never does; 561px tall is the existing short-landscape seam. So 375×667, 820×1180 and every
portrait tablet keep their stacked geometry, as does anything under 560px wide.

**Band rules (560-899px wide, 560px tall or less).** Compact row cards on Home,
the Download footprint and a rail that fills the height all come from the
existing short-landscape rules, now shared with this band. Band-specific: the
stage is a square capped at 11rem (the 900px+ cap is 14rem), the gutters are
1.25rem and the gap 1rem. At 720×450 the dialog is 608px wide, so the rail is
376px, wider than the 22rem container-query threshold, and the settings keep
their label beside the control instead of dropping it above. Header, labels,
controls stay at 14px text and 44px; the header title row uses the desktop
one-line layout, which saves a line of height. Nothing is hidden or turned into
an accordion.

**960×412.** Same short-landscape rules, plus: the split's block padding drops
to 0.5rem and the account note's gap to 0.5rem when the window is 500px tall or
less. That returns about 12px to the rail body. It is a small gain; the larger
cost at this size is the dock, the header and the dialog's own 3rem margin,
which this file does not own.

**Scope.** The stage visibility media query follows the CSS split breakpoint.
No markup, handler, auth, export or copy logic changed. The portrait phone and
tablet layouts and desktop are untouched. Publish still
uses its own column.

**Verification so far.** Round 1: the full type check and the changed Svelte
compile reported 0 errors and 0 warnings; the coordinator's browser results are
listed above. Round 2: no browser, test or build has run on this change.

**Verification owed.** Round 2, awaiting the coordinator: 720×450 (Download
Card with the rail scrolling once and the dock pinned; Download Video; Home,
whose three compact rows may scroll inside the 176px rail if hints wrap), 667×375
and 560×400 at the seam, 959×561 and 561 px tall at 700px wide to confirm the
stacked layout still holds just above the seam, 375×667 and 820×1180 unchanged,
960×412 for the added rail height, and the phone-transfer QR step in the band.
Check also that the sheet keeps the same box when switching Card and Video in
the band, that the Start row and Save to card button stay reachable by scroll,
and the earlier owed items: 1440×900 with the dock showing an account note, a
custom footer and Save to card, the Card to Video crossfade (both keys,
interrupted, reduced motion), focus order, and the video rows with a 3D export
(Quality row).
