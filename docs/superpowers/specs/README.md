# Spec queue and current handoff

Use `npm run specs:list` for the live queue and `npm run specs:next` for the next eligible task. Both are read-only. `npm run specs:check` validates metadata and links; `npm run specs:test` checks selection behavior. The validation and regression tests run in Web App CI.

## What the queue knows

The October 7, 2026 reconciliation reviewed all 195 immediate active/backlog specs for metadata, current handoffs, and acceptance gaps. It used focused source/history checks on drift candidates and likely next tasks. It was not a runtime acceptance audit of every feature. A dated review with `work_state: unverified` explicitly means current implementation evidence is still needed.

The queue holds unverified, blocked, unscored, stale, invalid, or claimed entries out of automatic selection. It reports implementation and verification separately. Priority scores retained from earlier reviews are estimates; a score does not establish readiness.

The original design bodies remain useful history. Follow the current metadata and dated handoff first. In particular:

- [Account Settings](active/2026-08-06-account-settings-redesign.md): the visible provider Connect label and browser acceptance remain.
- [Shape Matrix presentation](active/2026-08-31-shape-matrix-presentation-hardening-design.md): implementation exists; required geometry, performance, and motion evidence remains.
- [Film Director channels](active/2026-09-02-film-director-channel-architecture-design.md): phases 1-3 have implementation notes; Phase 4 still needs editorial clip instancing and retirement of `scene.extends`.
- [Shop unification](active/2026-08-02-shop-unification-design.md): checked implementation boxes do not resolve the external and product gates.

The [old Stage locomotion design](archived/2026-05-25-stage-locomotion-design.md), explicitly superseded in August, was moved to the archive with its inbound paths updated. This leaves 194 live specs. No spec was archived solely because its checklist was checked or commits mentioned its topic. Production changes, account actions, outbound messages, and explicit user decisions retain their existing approval boundaries.

## Maintaining it

The canonical workflow and field definitions live in [the queue skill](../../../.claude/skills/queue/SKILL.md). Update `remaining`, `work_state`, and the opening status together. Use null for unassessed value/effort. Set `last_triaged` after reviewing the actual remaining work, and cite concrete evidence for readiness or completion.

Plans use existing repository-root-relative paths. Internal dependencies must resolve to a shipped spec to unblock selection. `external:` dependencies remain held until evidence resolves them.

The queue covers direct Markdown children of `active/` and `backlog/`. It deliberately excludes `backlog/someday/`, archived designs, shipped specs, and historical plans. Those stores were not comprehensively audited by this pass. Reconcile inbound links when moving a spec; do not flatten or discard historical records to make counts smaller.

## Tool ownership

`scripts/spec-queue.cjs` owns parsing, validation, and selection. `scripts/spec-drift-detector.cjs` owns heuristic drift detection. Existing frontmatter scripts and skill synchronization were examined before adding the queue owner. The maintained `yaml` parser, already present transitively in the lockfile and now a direct development dependency, handles YAML rather than introducing another ad hoc parser.

Regression tests cover incorrect selection and false closeouts. Drift output remains advisory: inspect the evidence before changing status or starting implementation.

The final October 7 drift scan still reports ten candidates. Nine are held as unverified or blocked. The [GLB environment registry](backlog/2026-05-29-glb-environment-registry-design.md) remains selectable because its dated source check confirms the proposed registry files are absent; broad shared-code traffic is a documented false positive. Do not treat an advisory count as either acceptance proof or an instruction to rebuild a feature.
