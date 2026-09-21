---
name: ui-bust
description: Use when planning a new UI or substantial restyle, reviewing visual quality or generic AI-looking interfaces, or refreshing visual-design research. Provides evidence-grounded aesthetic review, not authorship detection.
---

# UI Bust

Use `/ui-bust` to review visual quality. It is read-only by default: it does not authorize a page rewrite, external upload, communication, or detector use. Local browser inspection and task-scoped evidence capture follow the existing task authorization; a reusable calibration archive requires separate scope.

Read [the operational contract](../../../docs/architecture/visual-review.md). Check the status of [the calibration reference](../../../docs/reference/visual-review-calibration.md); read its protocol when adding examples or evaluating reliability. Check [visual-design-evidence.md](../../../docs/reference/visual-design-evidence.md) for freshness at the start of substantial work; it owns research dates, checks, and the refresh process.

## Choose a mode

- **Review** (default): observe the supplied route or artifact and report evidence.
- **Plan**: before a new surface or substantial restyle, compare genuinely different compositions using the same real content, then recommend a direction. Continue to implementation when the user's task already authorizes it; a standalone planning request stays read-only.
- **Refresh**: read the evidence ledger's freshness status and follow its narrow refresh procedure. Do not re-research every CSS change.

Follow the product canon and the visual-verification contract. Browser observation is required to accept aesthetics: code and prose are not substitutes. A supplied screenshot may be described, but cannot establish interactions, states, other viewports, or what exists above/below its visible crop.

For a substantial design, use a separate reviewer when the runtime permits: give that reviewer the review brief and frames/route before sharing the builder's rationale. If this is not practical, label the result `self-review — less independent`; do not create arbitrary multi-agent loops.

Use fixed criteria and the report template in the contract. Limit aesthetic iteration to two correction rounds before surfacing any unresolved material tradeoff. Do not ask for approval when the scoped work has passed, and do not waive hard gates. Keep functional/accessibility/canon gates distinct from aesthetic concerns and owner preferences.
