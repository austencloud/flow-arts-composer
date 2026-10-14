> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-27-notation-playable-archive-design.md`; later implementation/remaining-work handoff `docs/superpowers/handoffs/2026-07-28-notation-playable-archive-handoff.md` remains open.

# /notation Playable Archive - Handoff (2026-07-27)

## Mission

Turn `/notation` from a vertically scrolling catalog into a one-screen,
playable archive. The approved direction is a horizontal focus-and-context
Artifact Rail with live source-derived objects, session discovery feedback, and
details that appear only after selection. The complete creative brief and
engineering contract is in
[`2026-07-27-notation-playable-archive-design.md`](./2026-07-27-notation-playable-archive-design.md).

The immediate recipient is Fable for a high-fidelity test-route prototype.
After Austen approves the art direction, Opus productionizes it.

## Done - verified

### 1. The current production catalog remains functional

The current route still renders the nine sourced entries from
`NOTATION_CATALOG`. The last local visual correction is commit `86da2882ec`,
which removed the forced 23rem wide-screen row height and the oversized
wide-only type.

Evidence from 2026-07-27:

- `npx vitest run tests/unit/notation-roots-remediation-contract.test.ts`:
  **13 passed / 13**
- visual inspection at 3840×2160, 2560×1440, 1920×1080, 1440×900, 820×1180,
  960×412, and 375×667
- no horizontal overflow at any measured viewport
- phone collapsed rows measured 89 to 92px
- zero `NotationCatalog.svelte` diagnostics in the captured repository check

The full repository check remained red on three type errors in another
session's modified
`src/lib/shared/qr/services/__tests__/short-code-manager.test.ts`. No notation
file appeared in the diagnostic log.

### 2. The redesign problem is now correctly framed

Austen rejected the page's underlying interaction model on 2026-07-27. The
issue is not row density. The issue is that the page behaves like a 2005
document: a person must scroll through words, there is little to click, and
nothing produces the playful response expected from a Kinetic Alphabet
surface.

This direct feedback supersedes the old visual-neutrality rule that every entry
must use the same shape with no accent or decorative media. It does not
supersede sourcing, attribution, chronology, or the prohibition on invented
relationships.

### 3. Internal primitive discovery is complete

The design spec records the exact reuse decisions. Verified reusable pieces
include:

- `tilt`, `cursorGlow`, `pressSpring`, and `magnetic` actions;
- `getHapticFeedback`;
- installed Embla 8.6.0;
- installed Motion 12.42.0 with `animateView`;
- `Crossfade`, `LazyMount`, and `Drawer`;
- the existing CAP assembly, QFT stage, shape matrix, SourceVideoCard, live TKA
  sequence stage, and StepStrip.

The shared `HorizontalSwipeContainer` was inspected and is not a fit unchanged:
it forces every slide to 100% width, while the approved composition needs a
large center artifact with visible neighbors. Use Embla directly for the
feature-specific rail instead of writing drag physics.

### 4. External 2026 interaction research is complete

The design direction was checked against The Playable Archive, Neal.fun,
Apple's feedback/game-control guidance, Material motion choreography, Motion's
2026 `animateView` API, W3C WCAG 2.2, and MDN's 2026 carousel guidance. Links
and the decisions drawn from them are in the design spec.

## Believed done - unverified

The experience spec is complete enough for a cold-start Fable session, but no
prototype has been built. Its emotional result is deliberately unverified.
Only a live prototype and screenshots can prove that it feels playful.

## In flight

No playable-archive implementation is in flight.

The existing checkout is `main`. Do not create a branch or worktree unless
Austen explicitly requests one in the active conversation.

At handoff time the shared worktree also contained unrelated changes in QR,
QFT test routes, Firestore parity tests, generator scripts, and archived QFT
frames. Do not stage, commit, revert, or format them.

Commit `86da2882ec` is local because another session's unpublished
`1cc2369cc4` profile-stage commit is its parent. Pushing `86da2882ec` before
that predecessor lands would publish another session's work.

## Loose ends (ranked)

1. **Fable builds `src/routes/test/notation-playable/` from the design spec.**
   Use the real catalog and existing primitives. Do not modify production
   `/notation`.
2. **Austen reviews the live prototype at 2560×1440 and 375×667.** The review
   question is emotional: does the first frame invite a hand movement, and
   does every selection feel rewarding?
3. **Fable iterates until the interaction language is approved.** The chosen
   rail architecture stays fixed; artifact material, lighting, geometry, and
   flourish remain open to visual direction.
4. **Opus productionizes the approved prototype.** Promote test-only visual
   components, integrate the public route, finish accessibility and
   performance, then run the full seven-viewport sweep.
5. **Push documentation and local notation commits when the unrelated
   predecessor is published.** Never push the predecessor on this session's
   behalf.

## Decisions already made

- The production destination is a one-screen playable archive, not a denser
  article.
- The main page must not require vertical scrolling to reach entries.
- Long factual copy is disclosed after selection.
- Chronology remains 2009 to 2022 and does not imply lineage.
- The old same-shape visual neutrality rule is retired.
- Source accuracy, creator attribution, and the current nine entries remain
  untouched.
- The Artifact Rail is the chosen information architecture.
- Visited state is session-local discovery, not XP or mastery.
- No free-roam 3D museum.
- No new sound system.
- Fable prototypes first in a test route. Opus integrates only after visual
  approval.

## Gotchas

- `src/routes/(public)/notation/+page.svelte` still describes the page as a
  catalog that "explains nothing." Preserve the sourcing intent, but the
  current comment and interaction model will need updating during production
  integration.
- `src/routes/(public)/notation/_components/NotationCatalog.svelte` contains
  phone chronology and progressive disclosure behavior that is replaced, not
  incrementally decorated, by the Artifact Rail.
- Do not animate one system transforming into another. That would state a
  relationship the sources do not establish.
- `QftStage.svelte` and `NotationShapeMatrix.svelte` currently live under test
  routes. Promote them instead of copying them.
- YouTube remains poster-led and external. The site CSP blocks embedded frames.
- Only one heavy live renderer may be active. Use static neighbors and
  `LazyMount`.
- Motion must be optional and interruptible. Reduced motion removes spatial
  travel, tilt, magnetic pull, and ambient loops.
- Port 5173 is Austen's HTTPS dev server. Never start, stop, or kill it.
- Any production visual diff requires screenshots at all seven mandated
  viewports.
