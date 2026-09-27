# Visual calibration — Round 01

Prepared 2026-09-21 in response to Austen's request to lead calibration. This is
a collection board, not a proposed About redesign or a validated detector of
AI authorship.

- Rubric: **VR-1**, unchanged.
- Manifest: `visual-calibration-round-01-v1` in [manifest.json](manifest.json).
- Six cases, eight frames. Every case is **calibration / unlabeled**.
- Owner judgments recorded: **0**. Held-out evaluations: **0**.
- Collector: Codex, primary-agent coordination with a Terra board implementation.
- Source screenshots are local review material, not product assets. Attribution
  is in the manifest and on the board. Do not publish them as TKA-owned artwork.

## Collection protocol

Use [the board](index.html). Judge only the shown frames, opening a source page
for additional context if needed. Record any such extra observation with the
answer: otherwise the evidence set has silently changed.

The first question records perceived design quality for the page's stated
purpose. It does not measure task success. The second asks about visual fit for
Composer. Keep the two answers separate. Blank, Mixed, Parts of it, and Unsure
are meaningful values; do not force them into accept/reject labels. A brief note
is optional but more informative than a number alone.

The browser holds choices only until reload. “View reactions” exposes JSON;
“Copy reactions” writes to the clipboard only when selected. Neither saves to
the repository or sends answers to a service. Austen can instead reply with
case letters and reactions in the conversation. Do not infer judgments from
silence or from the historical About rejection.

When Austen says the choices are ready:

1. Read the actual controls or his supplied answers. Confirm which case/frame
   each answer refers to; do not reload before reading them.
2. Record the exact values and wording in a separate `owner-labels.json`, with
   this manifest ID, date, source of the label, recorder, and any extra frames
   consulted. Preserve missing and uncertain answers.
3. Add rubric dimensions only as separately identified agent hypotheses unless
   Austen explicitly supplied them. The owner may like a page for a reason the
   six existing dimensions miss.
4. Update the calibration index with actual counts. Do not count unlabeled
   frames or treat one case-level answer as three independent About judgments.
5. Use the responses to propose review criteria. Before any reliability test,
   freeze the resulting rubric and select a **new, independent held-out set**.
   This whole round is visible during calibration and cannot later be promoted
   to held-out evaluation data.

After owner labeling, do not replace these frames under the same manifest ID.
Create a new version for changed captures and retain the evidence behind prior
judgments. The export includes the currently selected frame, not a claim that
every available frame was viewed.

No independent evaluator has scored this round. No accuracy, false-accept rate,
or false-reject rate can be reported yet.

## Capture provenance and limits

The manifest gives source URLs, CSS viewports, scroll positions, and visible
states. The WebP files are the persistent evidence; current source pages can
change. Public deployment revisions and authorship are unknown. Brand names
remain visible, so this is not a brand-blind study. Case letters are identifiers,
not rankings. References were selected by an agent for range, not by random
sampling or because Austen has approved them.

About and Composer were freshly captured from the existing development server
without changing their source. Main advanced during collection from
`ae2ce1956f7d39ae2fb6b68d926f609802f3b7c7` to `f340b05d7b`; the primary checkout
also contained unrelated in-flight work. These are development snapshots, not
claims of clean-build reproduction. The historical Temp screenshot was not
copied. The new About frames must receive their own judgments.

The local pages use native viewports because emulated capture produced scaling
artifacts. About is 1280×720 CSS pixels, rasterized at 1920×1080. Composer is
1600×900 CSS pixels, rasterized at 1920×1080 with the existing origin's 80% zoom.
The four external references were captured at 1440×900. Do not confuse displayed
thumbnail size with original text size, or attribute viewport differences to
design quality. Click a frame to inspect it at full size.

Other confounds include theme, dark versus light surfaces, brand familiarity,
subject matter, illustration budget, text length, signed-in navigation on
Composer, and motion frozen into a still. The frames do not establish missing
content below the fold, accessibility compliance, or interaction quality.
Ableton's exercise was idle; it is not an assessment of the sound experience.
GOV.UK supplies a different service context, not a pre-approved control or a
proposed visual identity for Composer. Current passport rules are out of scope.

## Verification

Collection-tool checks performed on 2026-09-21:

- Inline JavaScript parses; JSON is valid; all eight local frame paths resolve.
- Browser loading displays six cases with blank judgments. All six initial
  images load. About's frame selector updates the image, full-size link, and
  caption without replacing the answer controls.
- JSON preview preserves null, Mixed, No, Unsure, quoted text, the manifest ID,
  and selected-frame provenance. The preview does not write to the clipboard.
  Clipboard permission success/failure itself was not exercised; manual JSON
  preview is the tested path.
- A blocked manifest produces an explicit error and disables both export
  controls. The block was cleared, and all synthetic answers were discarded.
- All seven required CSS viewport sizes were measured with no document
  horizontal overflow. Controls measured at least 44px high. Long notes fit at
  640×360; reduced-motion preference does not introduce animation.
- Complete usable screenshots were inspected at 375×667, 960×412, 1440×900,
  1920×1080, and the native 1280×720 display. At 820×1180, 2560×1440, and
  3840×2160, the browser capture repeated pixels outside its native surface.
  Those images cannot support full-frame visual approval. Clearing emulation,
  changing capture scale, and adjusting the visible surface did not fix the
  large-emulation capture problem.
- 640×360 reflow is evidence for a narrow layout, **not** a substitute for an
  actual 200% browser-zoom check. Actual browser zoom remains unverified.

**Status: ready for local reactions, full visual-verification gate incomplete.**
Keep this task's branch and worktree intact; do not claim all viewport gates
passed or integrate it as fully verified. This tooling limitation does not
constitute a judgment of the reference designs or a reviewer-reliability result.
