---
status: active
value: 3
effort: M
remaining: "Verify User Onboarding Overhaul — Umbrella against the current User Onboarding Overhaul — Umbrella runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Slices A, B shipped; D shipped copy-only; Slice C unbuilt — the only live gap'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# User Onboarding Overhaul — Umbrella

**Queue evidence (2026-10-07):** Slices A and B shipped, D has copy only, and C remains open. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** Slices A, B shipped; D shipped copy-only; **Slice C unbuilt** — the only live gap
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-06-16
**Original status (historical):** Framing approved; slice B spec written, A/C/D pending their own brainstorm
**Owner:** Austen

## Why this exists

Research into the new-user experience (three parallel codebase scouts, 2026-06-16)
found a consistent shape: the app **teaches well, opens cold, and leaks work**.

- **Landing page** teaches notation from zero via the 6-card "How TKA Works"
  progression and the live "Play With It" spinner. Strong. (`src/routes/+page.svelte`)
- **Learn module** is a mature 28-concept curriculum plus the TIKA AI tutor,
  Codex, quiz drills, and an embedded Level 1 guide. Very strong, but entirely
  opt-in. (`src/lib/features/learn/`)
- **Create module (the doorway)** drops a new user on a blank grid with a
  3-bullet tab intro that already assumes "position", "beat", "LOOP". No
  scaffolded first sequence, no empty-state "start here".
- **Guest continuity** — a guest builds in local working state; there is **no
  wiring to carry that draft into the account on signup**. `LibraryRepository`
  is Firestore-only keyed by `getUserId()`, and a guest has no uid. Grep for
  `migrat|anonymous|mergeGuest|claimGuest` surfaced only settings/schema
  migrations. Silent work loss on signup is the highest-trust-cost defect.

Three mature surfaces, no connective tissue. The funnel that should read
**land → play → make → keep → return** breaks at "make" (cold doorway) and
"keep" (leaked work).

## Guiding principle

Extend the existing product philosophy, **"play with everything, pay to take it
home"** (memory: `project_premium_philosophy`). Onboarding's job is to remove
every reason a curious newcomer bounces before they have made one thing they
care about and can keep. Gating stays at the *take-it-home / go-premium*
boundary (export, Scribe features), never at the *play* boundary.

## Success definition

A first-time visitor who has never seen flow-arts notation can, without reading
docs or signing up first: understand what TKA is, build a short sequence with
guidance, see it animate, and have that sequence still be theirs after they
make an account. "Onboarded" = made one sequence they kept.

## The four slices

Decomposed because these are independent subsystems; each gets its own
spec → plan → build cycle. Build order **B → A → C → D** (continuity anchors the
rest: no point funneling people in if their work evaporates, and B carries the
highest architectural risk so it should be settled first).

### B — Guest continuity *(spec written: `2026-06-16-onboarding-slice-b-guest-continuity-design.md`)*
Anonymous Firebase identity, created lazily on first persistable action.
Signup upgrades it in place via the existing `linkWith*` flow — zero migration,
work carries over atomically. Guests gain a real cloud library (save survives
refresh); export and Scribe features stay gated. The real security work is
*closing* the anon abuse surface (community/social write paths that today gate
only on `isAuthenticated()`), not opening the save path (anon users already
satisfy `isOwner`). **Anchor slice — settles the identity model the others
build on.**

### A — Cold doorway *(brainstorm pending)*
Turn the blank Create grid into a guided first sequence. Direction: an
empty-state "start here" plus an optional scaffolded first-beat flow that
teaches by doing (pick start position → see options → tap to add → watch it
move), reusing the real Constructor components, not a separate tutorial mockup.
Depends on B: a scaffolded first sequence is only worth it if the result
persists. Open questions deferred to A's brainstorm: mandatory vs skippable,
which create mode anchors the flow (Constructor vs Generate), reuse of the
existing `CreateTutorialWizard` vs new empty-state primitive (grep first).

### C — Landing → Learn → Create bridge *(brainstorm pending)*
Wire the three mature surfaces together and fix entry routing. Direction:
QR/deep-links and "Get Started" land in the *tool* with context, not on
marketing; contextual "learn this" hops from Create into the relevant Learn
concept and back. Depends on B for identity (deep-link → anon session →
build → keep). Open questions deferred to C's brainstorm: `?start=create`
shortcode routing vs referer detection, where the Learn↔Create hooks live,
whether first-touch on mobile auto-loads the composer.

### D — Export gating policy *(brainstorm pending — smallest)*
Resolve the one place gating contradicts the philosophy: export is fully
blocked for guests. Direction: watermarked low-res guest export, unwatermarked
high-res for accounts/Scribe. Mostly a policy + small render-path change.
Depends on B (guest identity exists). Do last.

## Cross-slice invariants

1. **Identity is B's contract.** A, C, D assume the B model: a guest may hold an
   anonymous uid; "guest" tier = unauthenticated **or** anonymous; full-account
   gates use `isFullUser()`, not `isAuthenticated()`.
2. **No silent loss anywhere.** Any flow that could drop user work warns first
   and offers a recovery path (see slice B's collision-import and edge-case
   handling for the pattern).
3. **Reuse the real components.** Scaffolds and bridges render real Constructor /
   Learn / animation components, never emoji/mock stand-ins
   (cross-ref `never-hand-roll.md`, `visualization-routing.md`).
4. **Gate at take-it-home, not at play.** Export + Scribe are the walls; build,
   save, and animate are open.

## Out of scope

Developer onboarding (README/setup/architecture docs). Separate concern, not
covered here.
