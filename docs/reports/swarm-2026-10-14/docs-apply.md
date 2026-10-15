# Documentation application ledger

Date: 2026-10-14. Branch: `codex/swarm-docs-apply`. Baseline: `e124f81931d346a80537bb4b5dd2339f07e75dd9`.

Observation: the approved review is `docs-review.md`; its body remains unchanged. All work stays in this worktree. No primary-checkout access, integration, push, install, build, app check, dev server or external mutation was performed.

## ARCHIVE

Observation: ran the 26 unconditional `git mv` commands from the review. The archive README records every original path, archive destination and review reason. Link repairs cover inbound references and relative links inside moved records. Record bodies otherwise remain historical.

Verification: final moved-reference, Markdown-link, formatting and spec-queue results will be recorded below after all groups.

Observation: archive-group changes include 26 moves, an archive index, this ledger, and inbound repairs. Exact path/count inventory follows in the final verification section.

SKIPPED (ownership): references to original paths remain in `docs/superpowers/plans/shipped/2026-03-22-tka-composer-rename.md:618` and `docs/superpowers/specs/shipped/2026-07-22-kill-the-bar-app-forward-design.md:5`. Proposal: the coordinator should repair these two inbound references; this brief excludes that directory. Bare filenames in historical museum session transcripts describe past filesystem events and remain historical text.

## MERGE

Observation: seven sources archived after folding unique content into five survivors; no source was deleted. Every content landing has a dated merge note.

- Observation: `docs/architecture/guide-single-source.md` into `docs/architecture/canonical-learning-experience.md`: Print/PDF fidelity, structured content/reading order, tracker and Guide Reader provenance, SEO/accessibility continuity. Conflict: source says "The reader shell ... is the durable end-state UI" and "Retire `_sections/ch*`." Survivor October topic-owned Read/Learn/Play and individual coexistence/migration rules retained.
- Observation: `docs/learn/concepts-convergence-notes.md` into `docs/architecture/canonical-learning-experience.md`: Rejected simultaneous-layer skeleton, static-placement teaching rationale, progressive reveal/construction and reuse of assets. Conflict: source says "Converge on the Concepts module as the single learning surface." Survivor one-topic/three-view decision retained. Old pending quiz and removed positions owner are historical and were not imported as current facts.
- Observation: `docs/I18N-IMPLEMENTATION.md` into `docs/I18N-SYSTEM.md`: Sparse regional overrides, registered fallback variants and explicit singular/plural message example. Existing translation, parameter, dynamic-key, locale and validation examples already covered in survivor; not duplicated. Obsolete LanguageTab owner and 1,398-key claim not imported.
- Observation: `docs/MODAL_SIZING_STRATEGY.md` into `docs/architecture/responsive-design.md`: Height-aware, content-first viewport-safety rationale. Conflict: source says "No hardcoded max-widths"; survivor modal-token contract retained (modal-tokens.css defines 360px/480px/640px variants). Absent modal-layout.ts/getLayoutMode example not imported as implemented.
- Observation: `docs/reference/bridge-free-words.md` into `docs/reference/tka-valid-words.md`: Position-family rationale, February filter/corpus provenance and 26 word definitions. Reconciled 25 shared words and source-only MOTORSPORTS; retained source-only entry as historical candidate, not an addition to the 1,137-word May corpus.
- Observation: `docs/reference/vtg-accuracy-audit.md` into `docs/reference/vtg-final-audit.md`: Initial PDF/wiki method, club-origin context and unique coverage inventory questions. Conflict: early issue text reports missing Maiki/Ben entries while survivor lists them VERIFIED; survivor outcome retained. No revival of elemental-model conflation.
- Observation: `docs/reference/vtg-attribution-audit.md` into `docs/reference/vtg-final-audit.md`: Lorq collaboration/Cantor section citation trail, earlier Buer/Boutilier uncertainty, contributor-scope and ancillary app-credit questions. Conflict: source says "Lorq Nichols is not listed as a contributor"; survivor lists Lorq VERIFIED. Survivor outcome retained; former omissions treated only as March history.
