/**
 * Stylelint — CSS-debt regression guard (ADVISORY).
 *
 * Single focused rule: `declaration-no-important`. No stylelint-config-standard
 * (would flood output with stylistic noise) and no `color-no-hex` (9000+ legit
 * scoped-CSS hex colors — identity colors for props/LOOP brand/demos that
 * correctly stay hex; stylelint also can't see the inline `style="…"` colors
 * Phase 4 actually targeted).
 *
 * Severity is "warning". The codebase has a LEGITIMATE, permanent !important
 * baseline (~460) that is correct:
 *   - reduced-motion blocks (`transition: none !important`) — idiomatic a11y
 *   - parent `:global()` overrides of a CHILD component's Svelte-scoped styles —
 *     the only sanctioned way to reach into an encapsulated renderer
 *     (CellCanvas → AnimatorCanvas, PictographTimelineLab → AsciiRawPreview)
 * A hard `error` would falsely fail on that correct baseline. This config is run
 * via the advisory `npm run lint:css` (NOT the CI-blocking `lint`) for two
 * reasons: (1) postcss-html mis-parses a few Svelte SVG/template constructs as
 * CssSyntaxError, and (2) hard enforcement needs a baseline plugin to ignore the
 * existing legit set — a follow-up. Until then it surfaces new !important to
 * reviewers.
 *
 * Before adding a NEW !important: route it through a token/custom-property API
 * (see Drawer.svelte's --sheet-* props, which replaced ~135 drawer-skin
 * !important) or raise selector specificity. If it is a genuine child-scoped
 * override or reduced-motion case, add a `/* reason: … *​/` comment so reviewers
 * can tell legit from lazy.
 */
export default {
  // postcss-html trips on a handful of files with SVG attrs / template
  // expressions inside style context (Unknown word "stroke"/"solid"/…). Ignore
  // them so the advisory run is clean; they are parser false-positives, not bugs.
  ignoreFiles: [
    "src/routes/test/mandala-mobile/+page.svelte",
    "src/routes/(public)/guide/codex/poster/+page.svelte",
    "src/lib/shared/sequence-viewer/components/CardGridLayout.svelte",
    "src/lib/shared/sequence-viewer/components/MandalaExportTakeover.svelte",
    "src/lib/shared/sequence-viewer/components/MandalaPane.svelte",
    "src/lib/features/create/generate/components/cards/GenerateButtonCard.svelte",
    "src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte",
  ],
  overrides: [
    {
      files: ["**/*.svelte", "**/*.html"],
      customSyntax: "postcss-html",
    },
  ],
  rules: {
    "declaration-no-important": [true, { severity: "warning" }],
  },
};
