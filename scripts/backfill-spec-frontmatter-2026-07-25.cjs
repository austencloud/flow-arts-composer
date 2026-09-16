#!/usr/bin/env node
// First-pass frontmatter backfill for unscored specs in active/ and backlog/.
// value/effort are authored below (triage judgment). `remaining` is EXTRACTED from
// each spec's own body status line so it stays factual rather than invented.
const fs = require("fs");
const path = require("path");

const ROOT = "E:/tka-platform/docs/superpowers/specs";
const TODAY = "2026-07-25";

// slug -> [value, effort]
const SCORES = {
  // ---- active/ ----
  "2026-05-04-god-file-decomposition-design": [3, "L"],
  "2026-05-12-anatomical-ik-constraints-design": [1, "M"],
  "2026-05-12-spatial-lab-design": [2, "L"],
  "2026-05-20-per-performer-prop-sizing-design": [2, "M"],
  "2026-05-20-scene-composer-design": [3, "XL"],
  "2026-05-21-viewer-popover-architecture-design": [3, "L"],
  "2026-05-25-mandala-roadmap": [2, "L"],
  "2026-05-28-animation-engine-rearchitecture-design": [4, "L"],
  "2026-05-28-export-fidelity-and-share-design": [3, "M"],
  "2026-05-28-inspect-panel-redesign-design": [3, "M"],
  "2026-05-29-3d-trail-parity-design": [3, "S"],
  "2026-05-29-p3p5-unified-render-context-export-design": [3, "M"],
  "2026-05-30-deriver-collapse-design": [3, "L"],
  "2026-05-30-loop-composer-deoverwhelm-design": [3, "S"],
  "2026-05-31-card-arrow-fix-design": [3, "M"],
  "2026-05-31-ceremony-phase5-stateless-isolated-design": [3, "L"],
  "2026-05-31-unified-generation-vocabulary-design": [3, "L"],
  "2026-06-04-effects-preset-data-consolidation-design": [2, "XS"],
  "2026-06-04-header-pattern-glyphs-design": [3, "M"],
  "2026-06-12-canon-prop-creators-redesign": [3, "M"],
  "2026-06-16-codebase-quality-audit-operation": [3, "XL"],
  "2026-06-16-effect-leg-bolstering-design": [3, "M"],
  "2026-06-16-modular-kit-museum-design": [2, "M"],
  "2026-06-16-performance-audit-design": [4, "M"],
  "2026-06-16-user-onboarding-overhaul-umbrella": [3, "M"],
  "2026-06-18-first-time-user-audit": [4, "M"],
  "2026-06-19-wave9-flagged-findings": [3, "M"],
  "2026-06-20-real-flow-notation-aruco-design": [4, "L"],
  "2026-06-21-art-settings-panel-design": [3, "S"],
  "2026-06-21-enchanted-autumn-dusk-design": [2, "M"],
  "2026-06-21-personal-museum-design": [2, "L"],
  "2026-06-21-tutorial-coach-mark-start-placement-design": [3, "S"],
  "2026-06-22-qr-minimal-viewer-parity-design": [4, "S"],
  "2026-06-22-qr-scan-to-play-design": [4, "M"],
  "2026-06-22-tunnel-effects-layer-coverage-design": [3, "M"],
  "2026-06-23-effect-tuner-design": [3, "M"],
  "2026-06-24-effect-defaults-tuning-progress": [4, "M"],
  "2026-06-25-remote-hardening-session": [3, "M"],
  "2026-06-27-variation-picker-polish-design": [3, "S"],
  "2026-06-28-hardening-audit-findings": [3, "M"],
  "2026-06-28-hardening-audit-wave2": [3, "S"],
  "2026-06-29-create-tutorial-mobile-fullscreen-design": [4, "M"],
  "2026-06-29-create-tutorial-type1-and-tap-play-design": [4, "M"],
  "2026-06-29-fire-switch-prewarm-design": [3, "M"],
  "2026-06-29-instant-scan-card-pictographs-design": [4, "M"],
  "2026-06-30-account-deletion-provider-aware-reauth-design": [4, "M"],
  "2026-06-30-add-to-collection-ux-design": [4, "M"],
  "2026-06-30-choreo-sheet-design": [4, "L"],
  "2026-06-30-content-hash-v2-rollout": [3, "M"],
  "2026-06-30-creator-profile-readability-density-design": [3, "S"],
  "2026-06-30-crossfade-primitive-design": [2, "XS"],
  "2026-06-30-minimal-2d-player-chrome-design": [3, "M"],
  "2026-06-30-reversal-derivation-reconciliation-findings": [3, "M"],
  "2026-06-30-save-to-library-polish-design": [3, "M"],
  "2026-07-01-choreo-act-playback-design": [4, "M"],
  "2026-07-01-choreo-sheet-v2-design": [4, "M"],
  "2026-07-01-gallery-drill-content-peek-design": [4, "XL"],
  "2026-07-01-gallery-front-door-phase1-design": [4, "M"],
  "2026-07-01-my-collections-tab-design": [3, "M"],
  "2026-07-01-presence-as-signal-register": [4, "M"],
  "2026-07-02-gallery-thumbnail-warm-pass-design": [4, "M"],
  "2026-07-02-library-home-design": [3, "L"],
  "2026-07-02-scan-card-to-collection-design": [4, "M"],
  "2026-07-02-sw-update-flow-design": [3, "M"],
  "2026-07-02-viewer-scan-chrome-unification-design": [3, "L"],
  "2026-07-02-whats-new-toast-design": [2, "S"],
  "2026-07-03-fable-dispatch-index": [5, "S"],
  "2026-07-03-fable-loop-detection-audit-fixes-design": [4, "M"],
  "2026-07-03-fable-mandala-signature-identity-design": [2, "S"],
  "2026-07-03-fable-practice-judgment-loop-design": [4, "M"],
  "2026-07-03-fable-real-flow-notation-validation-design": [4, "M"],
  "2026-07-03-scan-handoff-desktop-to-phone-design": [3, "L"],
  "2026-07-03-sectioned-virtual-gallery-design": [3, "M"],
  "2026-07-05-content-hash-v2-checkpoint-package": [3, "L"],
  "2026-07-05-hover-expand-overlay-sidebar-design": [3, "L"],
  "2026-07-05-qr-account-funnel-design": [4, "S"],
  "2026-07-05-shortcode-dup-mint-fix-design": [4, "M"],
  "2026-07-06-max-turn-intensity-filter-design": [3, "M"],
  "2026-07-06-smart-collections-design": [3, "M"],
  "2026-07-07-founding-smart-collections-design": [3, "L"],
  "2026-07-08-collections-ia-mine-joint-others-design": [3, "M"],
  "2026-07-08-reversal-pattern-smart-collections-design": [3, "M"],
  "2026-07-11-fable-parallel-dispatch-tonight": [4, "M"],
  "2026-07-13-shop-cart-order-doc-design": [4, "M"],
  "2026-07-14-multi-select-turn-editing-design": [3, "M"],
  "2026-07-17-poi-legal-composer-filtering-design": [3, "M"],
  "2026-07-20-q-scan-instrumentation-ledger": [3, "M"],
  "2026-07-22-first-session-activation-design": [5, "L"],
  "2026-07-22-trail-hand-tracking-mode": [4, "S"],
  "2026-07-23-first-session-exception-remediation": [4, "S"],

  "2026-04-27-kickstarter-campaign-design": [3, "L"],
  "2026-05-05-edge-ssr-migration-design": [2, "L"],
  "2026-05-12-beta-offset-swap-design": [3, "M"],
  "2026-05-13-left-rail-2d-3d-split-design": [2, "M"],
  "2026-05-23-3d-scene-performance-design": [3, "M"],
  "2026-05-23-accessibility-fixes-design": [3, "M"],
  "2026-05-23-firebase-cost-optimization-design": [3, "M"],
  "2026-05-23-security-hardening-design": [4, "L"],
  "2026-05-23-social-sharing-ssr-design": [3, "M"],
  "2026-05-23-spacing-token-system-design": [3, "M"],
  "2026-05-23-utility-deduplication-design": [2, "M"],
  "2026-05-24-viewer-orchestrator-state-machine-design": [3, "L"],
  "2026-05-25-mandala-phase2-trails-design": [2, "M"],
  "2026-05-25-mandala-phase3-shareable-links-design": [2, "M"],
  "2026-05-25-ocean-scene-cache-layers-design": [2, "M"],
  "2026-05-25-prop-selection-redesign-design": [3, "M"],
  "2026-05-25-stage-locomotion-design": [2, "L"],
  "2026-05-25-stage-locomotion-polish-backlog": [2, "M"],
  "2026-05-27-dyads-fused-pictographs-design": [2, "L"],
  "2026-05-27-half-step-midpoints-design": [3, "M"],
  "2026-05-27-multi-axis-deck-picker-design": [2, "M"],
  "2026-05-27-tka-classification-duality-design": [2, "L"],
  "2026-05-29-glb-environment-registry-design": [3, "M"],
  "2026-05-29-museum-keepalive-persistence-design": [2, "M"],
  "2026-05-30-box-mode-axis-design": [3, "M"],
  "2026-05-30-parity-harness-unification-design": [3, "M"],
  "2026-06-17-tka-explanation-single-source-design": [3, "M"],
  "2026-07-17-flow-arts-seo-landscape-research": [3, "M"],
};

const NO_STATUS =
  "Unscored until triage 2026-07-25; spec body carries no status line. " +
  "Needs a read-through to establish real state before this score is trusted.";

// Pull the spec's own declared status out of the body.
function extractStatus(body) {
  const lines = body.split(/\r?\n/);
  for (const line of lines.slice(0, 40)) {
    const m = line.match(/^\s*\*\*Status:?\*\*:?\s*(.+)$/i) || line.match(/^\s*Status:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

// YAML double-quoted scalar: collapse whitespace, escape \ and ", cap length.
function yamlQuote(s, max = 400) {
  let t = s.replace(/\s+/g, " ").trim();
  if (t.length > max) t = t.slice(0, max - 1).replace(/[\s,;.]+\S*$/, "") + "…";
  return '"' + t.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

let done = 0;
const skipped = [];
const unmapped = [];

for (const dir of ["active", "backlog"]) {
  for (const file of fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".md"))) {
    const full = path.join(ROOT, dir, file);
    const raw = fs.readFileSync(full, "utf8");

    if (raw.startsWith("---")) {
      skipped.push(`${dir}/${file} (already has frontmatter)`);
      continue;
    }
    const slug = file.replace(/\.md$/, "");
    if (!SCORES[slug]) {
      unmapped.push(`${dir}/${file}`);
      continue;
    }

    const [value, effort] = SCORES[slug];
    const status = extractStatus(raw);
    const remaining = status
      ? yamlQuote(`Body status: ${status}`)
      : yamlQuote(NO_STATUS);

    const fm = [
      "---",
      `status: ${dir}`,
      `value: ${value}`,
      `effort: ${effort}`,
      `remaining: ${remaining}`,
      'depends_on: ""',
      'plan_path: ""',
      "tags: []",
      `last_triaged: ${TODAY}`,
      "---",
      "",
    ].join("\n");

    fs.writeFileSync(full, fm + raw, "utf8");
    done++;
  }
}

console.log(`backfilled: ${done}`);
console.log(`already had frontmatter: ${skipped.length}`);
if (unmapped.length) {
  console.log(`\nUNMAPPED (no score authored) — ${unmapped.length}:`);
  unmapped.forEach((u) => console.log("  " + u));
}
