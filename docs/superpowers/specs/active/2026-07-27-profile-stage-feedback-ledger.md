---
status: active
value: 3
effort: M
remaining: "Verify Profile as a Stage — Feedback Ledger against the current Profile as a Stage — Feedback Ledger runtime and acceptance criteria before resuming implementation. Prior recorded remainder: 'Living direction ledger for Profile-as-a-Stage, not a build spec — the Settled table must not be relitigated. Open: item 12 (word header on top of EVERY medium, not just the animation canvas) in progress; ProfileShowcase/ProfileTabs unreferenced but not safe to delete until other consumers are checked; black quads in the 3D scene preview (particle sprites failing to texture); stored 3D-scene names wrong in Firestore (FPsi repeated, wants a data repair not just render-time simplification); collection visibility field + rules and pin/unpin UI never started, so Showcase is auto-picked because nothing writes PinnedItem. Items 1, 4 and 7 are closed.'"
depends_on: ""
plan_path: ""
tags: [profile, creators, feedback-ledger, direction]
last_triaged: 2026-10-07
work_state: unverified
---
# Profile as a Stage — Feedback Ledger

Every piece of direction Austen has given on this feature, in his terms, so a
later session does not re-derive it or re-ask. Live surface:
`/creators/[id]` (UserProfilePanel → ProfileStage). Harness: `/test/profile-stage`.

Design doc: `2026-07-26-profile-as-stage-design.md`.
Original handoff: `2026-07-26-profile-as-stage-handoff.md`.

---

## Settled — do not relitigate

| # | Direction | Status |
|---|---|---|
| 1 | Every artifact renders in ITS OWN medium. A sequence animates, a scene loads the real 3D viewer, a mandala draws from steps. Not one card front for all. | Shipped |
| 2 | The landing-page composite is the baseline sequence presenter: animation canvas with the pictograph strip below it. | Shipped |
| 3 | Hovering a sequence shows the static choreo card so the whole thing can be read at once. | Shipped |
| 4 | Autoplay must never STEAL access to the choreo card. "I have no way to actually go back to the card because it's automatically made itself play the animation." | Shipped (hover reveal) |
| 5 | Do NOT dim or quiet the loading placeholder. "I'd rather not make the placeholder stop shouting." | Honoured |
| 6 | Warm the cache, keep it warm, warm in the background where possible. | Largely moot — mandalas render from steps, no cache |
| 7 | Consolidate rather than patch the same bug twice. "consolidate, obv" | Applied (one hydrator, one `engineAlignScale`) |
| 8 | Big mandalas, filling their whole square. "I really love the big ass mandalas and I like them taking up their whole square." | Honoured EXCEPT the animation overlay, which must register with the trail (~61%) |
| 9 | The mandala overlay must match the path the prop actually traces. | Shipped — `engineAlignScale` |
| 10 | One width per page. No dead rail at 4K. | **Shipped 2026-07-29.** The panel now uses `var(--shell-w)` (fluid, 2600 ceiling) instead of a hardcoded 1920 cap — dead rail at a real 3840 went 960px → 592px per side, and the panel carries its own type ramp so elements scale too (`2026-07-29-profile-person-first-design.md`) |
| 11 | Band chrome must ride the same type ramp as the tiles it labels. | Shipped |
| 12 | **The word belongs in a header on top of each artifact, for every medium — not a caption at the bottom left.** The animation canvas already has this header; build the same one around all the others. Portrait tiles are fine. | In progress |
| 13 | **The page must ARRIVE, and it must END.** "it should feel like I'm already on the destination as soon as I get there ... when I scroll down it's just a sea of mandalas." | Shipped — the Archive is a doorway (`2026-07-27-profile-lobby-design.md`). Measured at 1920×1080: 10.52 screens → 4.12; Showcase bottom 857px, above the 1080 fold |

## Standing process direction

- **Always give clickable links.** `https://` even for localhost; `file://` with
  absolute forward-slash paths for local files.
- **Do the work, don't describe it.** Describing a migration instead of doing it
  drew "??? it's not different."
- **Don't plead low context.** "you're all whiny because you don't have enough
  context ... I think you'll be fine." Compact and continue.
- **Screenshot your own work** before reporting a visual change.

## Open

1. ~~**Live panel width** — `.profile-layout` caps at `max-width: 1920px`.~~
   **Closed 2026-07-29.** Replaced with `var(--shell-w)`; the identity rail now
   absorbs a slice of the extra width so tiles grow rather than multiply, and a
   panel-scoped type ramp (the root ramp is scoped to `.mkt-shell` /
   `.legal-container` / `.qft-app` and never reached in-app) scales type and the
   avatar in lockstep. Measured at a real 3840: band 2600px, dead rail 592px per
   side, archive tiles 233px → 364px, root 16px → 23.3px.

   Residual, lower priority: a **visitor** view of a prolific creator is still
   short at 3840 (two bands, one row each) so the page ends around 73% down.
   That is the doorway design working as intended; adding rows would undo it.
   An own-profile view fills further because Collections adds strips.
2. **`ProfileShowcase.svelte` / `ProfileTabs.svelte`** are unreferenced by
   UserProfilePanel now. Not deleted — every other consumer must be checked first.
3. **Black quads in the 3D scene preview** — particle sprites failing to texture.
   Lead: `reference_render_context_registry_async_init`.
4. ~~**Archive virtualisation** — `archiveCap` (120 of 505) is a stopgap.~~
   **Closed 2026-07-28.** The doorway removed the wall, so `archiveCap` was
   deleted rather than made smarter. Nothing to virtualise: the band renders one
   row and hands off to Browse.
5. **Stored 3D-scene names are wrong in Firestore** — "FΨFΨFΨFΨ — 3D scene".
   ArtifactTile simplifies per token at render time; the data still wants a repair.
6. **Collection `visibility` field + rules, pin/unpin UI** — never started; the
   Showcase is auto-picked because `PinnedItem` exists but nothing writes it.
7. ~~**A visitor's Collections band shows the VIEWER's collections.**~~
   **Fixed 2026-07-28**, and it was not cosmetic. `ensureStarted(uid)` on the
   three art singletons repoints where they READ *and WRITE*; the stage passed
   the visited creator's id, so the rejected owner-only load left the viewer's
   entries in place (rendered as the owner's, Showcase included) AND aimed the
   viewer's next save at a stranger's namespace, where the rules bounced it.
   The Collections band is now own-profile-only — saved art is private by rule
   (`allow read ... if isOwner`), so there is nothing a visitor could be shown.
