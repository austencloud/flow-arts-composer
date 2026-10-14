> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-25-creators-discovery-design.md`.

# Creators Discovery Redesign — Handoff

**Date:** 2026-07-25  
**Branch:** `main`  
**Next owner:** Opus 5  
**Status:** Navigation work is sound. The current visual redesign is rejected and disposable.

## Mission

Keep Creators as a first-class, tabless module at `/creators`, then redesign its discovery experience from a blank canvas.

Austen's direction is explicit:

- The original screen is an overwhelming grid of names with little information that helps someone choose a creator.
- The current Codex redesign is rejected as generic AI work. Do not polish it, iterate on it, or treat its visual decisions as constraints.
- Go full-send on a distinctive, polished, modern discovery experience.
- The screen should help people discover creators through their actual work, taste, activity, and relevance, not just identity cards.
- The result will go to Fable for a second design review, so prepare a coherent design rationale and a strong browser-ready composition, not only code.

Start with concept work. Produce two or three meaningfully different page models, compare them against the real data and usage goals, then commit to one. Avoid defaulting to a marketing hero followed by filters followed by a uniform card grid. That is the rejected direction currently in the worktree.

The screenshot that triggered the redesign is:

`C:\Users\Austen\AppData\Local\Temp\codex-clipboard-pe4232.png`

It shows the pre-redesign page at `https://localhost:5173/creators`: four tall columns of similarly weighted profile cards, repeated Follow buttons, decorative color competing across every card, and no useful preview of what each person makes.

## Done — verified

### Creators is a first-class module

The stable architectural decision is implemented in the current working tree:

- `creators` is a module ID with its own lazy-loaded module.
- It is a tabless destination with canonical routes `/creators` and `/creators/[id]`.
- Old `/browse/creators/*`, `/social/creators/*`, and `/app/...` creator links normalize to the canonical route.
- Creators is available in production and readable by guests.
- Social remains a separate hidden module for Community and Connect.
- Creator-owned source was moved from `src/lib/features/browse/creators/` to `src/lib/features/creators/`.

Current proof:

```text
npm test -- --run tests/unit/creator-discovery.test.ts tests/unit/creator-routes.test.ts tests/unit/creators-module-registration.test.ts tests/unit/auth/guest-access-config.test.ts

Test Files  4 passed (4)
Tests       26 passed (26)
Duration    1.03s
Run         2026-07-25 21:13 local
```

The focused suite covers canonical and legacy creator routing, module registration, guest access, rich creator matching, and public-work sample grouping.

An earlier full `npm run check` on this Creators working set completed with 0 errors and 4 unrelated warnings in `GlossaryDictionaryCard.svelte`, `GamesStripSection.svelte`, and `HeroCarouselSection.svelte`. Treat the focused run above as the current proof point because formatting-only cleanup happened after that full check.

### Useful implementation research is complete

These internal building blocks were located and evaluated:

- `src/lib/shared/browse/get-browse-loader.ts` supplies one cached public-sequence metadata load. Use this to associate work with creators without making one request per person.
- `src/lib/features/browse/gallery-home/pick-representatives.ts` now includes `pickCreatorSamplesByOwnerId`, which groups representative public work by stable owner ID.
- `src/lib/shared/browse/components/SequencePeek.svelte` is the moved, reusable sequence preview.
- `src/lib/shared/browse/components/PropAwareThumbnail.svelte` is available when a richer sequence thumbnail is justified.
- `src/lib/shared/components/avatar/RobustAvatar.svelte`, `PanelSearch.svelte`, `SegmentedControl.svelte`, and `FilterChipBase.svelte` are existing primitives.
- `src/lib/features/browse/collections/components/CreatorLibraryCard.svelte` is a content-led internal reference, but its loader path performs per-creator requests. Do not copy that data strategy.
- `src/lib/features/creators/domain/creator-search.ts` matches display name, username, bio, pronouns, location, and prop labels.

External research reviewed:

- [Apple search fields guidance](https://developer.apple.com/design/human-interface-guidelines/search-fields): dedicated discovery surfaces should expose useful categories and suggestions before search, keep search inline with results, and support scopes or tokens when they materially narrow a large set.
- [Apple WWDC26: Design intuitive search experiences](https://developer.apple.com/videos/play/wwdc2026/292/)
- [Baymard product-list and filtering research](https://baymard.com/research/ecommerce-product-lists): balance enough list information to make a choice with useful filtering and sorting.
- [Baymard's current state of product lists](https://baymard.com/blog/current-state-product-list-and-filtering): multiple visual examples improve comparison when visual output is central to the choice.
- [Heylist AI Search update](https://www.heylist.com/updates/ai-search): a recent creator-discovery example that makes a creator's output visible in the result instead of reducing discovery to a directory of names.

These are inputs, not a prescribed layout.

## Believed done — unverified

- The top-level module wiring rendered for Austen at `/creators`, as shown in the supplied browser screenshot. Codex did not perform an independent interactive browser verification.
- The new creator sorting fields `sequenceCount` and `followerCount` are wired through the domain sort model and data state. They pass the focused test suite but have not been visually exercised.
- The richer creator-search matcher and owner-ID sample grouping pass unit tests. Search still operates on locally loaded creator pages, not the full global creator corpus.
- The rejected draft removed per-card dominant-color image extraction, which should reduce visible-card work. No before/after performance trace was captured.
- The rejected draft fixes a follow-state bug by changing the local follower count only after the repository write succeeds. Preserve that behavior in the rewrite, but verify it in the final interaction.

## In flight

Everything is on the existing `main` checkout. No branch or worktree was created.

The worktree is heavily shared with other sessions. Never use broad restore, clean, add, or commit commands. Scope every operation to exact Creators paths.

### Stable work to preserve

The following areas contain the first-class-module/routing implementation and should survive the visual restart:

- `src/lib/shared/navigation/domain/types.ts`
- `src/lib/shared/navigation/config/module-definitions.ts`
- `src/lib/shared/modules/ModuleRenderer.svelte`
- `src/lib/shared/environment/environment-features.ts`
- `src/config/feature-flags.ts`
- `src/lib/shared/auth/domain/guest-access-config.ts`
- `src/lib/shared/navigation/config/tab-definitions.ts`
- `src/lib/features/social/SocialModule.svelte`
- `src/lib/shared/navigation/services/creator-routes.ts`
- `src/lib/features/creators/CreatorsModule.svelte`
- `src/lib/features/creators/state/creators-routing.svelte.ts`
- `src/lib/features/creators/components/UserProfilePanel.svelte`
- creator-route call sites in navigation coordination, inbox, admin toggles, prefetch, and screenshot configuration
- creator module and routing tests under `tests/unit/`
- module strings in `messages/*.json`

Git currently represents the ownership move as tracked deletions under `src/lib/features/browse/creators/` plus an untracked `src/lib/features/creators/` directory. That is expected until the feature work is intentionally committed.

### Rejected draft to replace

These files currently embody the rejected visual direction:

- `src/lib/features/creators/components/CreatorsPanel.svelte`
- `src/lib/features/creators/components/CreatorCard.svelte`
- `src/lib/features/creators/components/VirtualizedCreatorGrid.svelte`
- `src/lib/features/creators/components/FeaturedCreatorsSection.svelte`
- `src/lib/features/creators/components/CreatorsSortBar.svelte`

The draft uses:

- a generic page intro with eyebrow, title, supporting text, and aggregate stats;
- All/Following segmented scope plus a public-work filter;
- a two-column virtualized grid;
- content-led profile cards with avatar, bio, metadata, stats, three sequence previews, and Follow;
- Most Work and Most Followed sorting.

Do not treat this hierarchy or component composition as a starting point. Retain useful data plumbing only where it supports the concept you select.

Other draft changes that may be retained independently:

- `src/lib/features/creators/domain/creator-search.ts`
- `pickCreatorSamplesByOwnerId` in `src/lib/features/browse/gallery-home/pick-representatives.ts`
- the `SequencePeek.svelte` move into `src/lib/shared/browse/components/`
- the follow-write sequencing fix in `CreatorsPanel.svelte`
- the `sequenceCount` and `followerCount` sort criteria
- `tests/unit/creator-discovery.test.ts`

The final small accessibility and no-layout-shift cleanup attempted before this handoff did not apply. In the rejected draft:

- the sort trigger still changes width between labels;
- sort menu items are still `div role="menuitem"` rather than native buttons;
- the card's Follow button is minimum-width rather than fixed-width;
- some copy incorrectly implies `sequenceCount` is always a public count;
- `publicCreatorCount` counts all owners in public sequence metadata before applying visible-account rules.

These issues are documented only so they are not mistaken for finished behavior. Replacing the draft is the priority.

## Loose ends (ranked)

1. **Design the information architecture before touching the rejected CSS.** Define what decision the page helps a visitor make, what signals support that decision, and what the first screen should reveal. Inspect the real creator and public-sequence fields before choosing the layout.
2. **Develop two or three distinct concepts.** Strong candidates worth testing include an editorial discovery surface with featured work and a compact directory, a work-first visual feed grouped by creator, and a master-detail explorer that keeps a dense creator index beside a rich preview. These are prompts, not requirements. Do not produce three cosmetic card-grid variants.
3. **Choose the concept using real constraints.** It must work with dozens or hundreds of creators, uneven profile completeness, creators with no public work, guests who cannot follow, mobile widths, long names/bios, and asynchronous work previews.
4. **Make discovery useful before search.** The default state should offer meaningful entry points based on real available data, such as recent work, active creators, prop affinity, creators the user follows, or curated spotlights. Do not invent ranking claims the backend cannot support.
5. **Make creator work the evidence.** A visitor should be able to infer style or relevance without opening twenty profiles. Use real sequence presentation deliberately, not as three tiny decorative thumbnails attached to every card.
6. **Keep hierarchy calm.** Avoid making every avatar color, border, badge, metadata line, and Follow control compete at the same visual weight. Repetition must support scanning.
7. **Audit the data path.** Reuse the cached public-sequence metadata load or design a better aggregate query. Do not introduce N+1 reads. Decide how pagination and client-side search communicate partial results.
8. **Prototype at the target viewport before hardening.** The supplied screenshot is approximately 2029 × 1249 with a narrow app sidebar. Build the desktop composition there, then verify at representative tablet and mobile widths.
9. **Invite the Fable review with a concrete artifact.** Capture the chosen layout, summarize the problem it solves, state the data assumptions, and list the one or two decisions where Fable's judgment is most useful.
10. **Finish with project-grade verification.** Run focused tests, the appropriate check command, and visual browser verification after obtaining current-session permission for interactive Chrome use. Report actual evidence.

## Decisions already made

- **Austen, 2026-07-25:** Creators is a first-class destination, not a tab under Browse and not a single tab inside Social.
- **Austen, 2026-07-25:** The destination is tabless. Clicking Creators should open the page directly.
- **Austen, 2026-07-25:** The old creators grid is overwhelming and does not provide useful information for choosing a creator.
- **Austen, 2026-07-25:** The current Codex visual redesign is rejected as generic AI work.
- **Austen, 2026-07-25:** Opus 5 should redo the visual experience from scratch and aim for a polished, current, top-tier layout.
- **Austen, 2026-07-25:** Fable will review the next serious concept, so the work should be presented as a defensible design rather than a pile of UI changes.
- Canonical URLs are `/creators` and `/creators/[id]`; legacy creator URLs should redirect or normalize without breaking bookmarks.
- Social remains hidden and retains Community and Connect. Do not reinsert Creators there.
- Do not move Creators back under Browse merely because public sequence data comes from Browse infrastructure.

## Gotchas

- Port 5173 is Austen's HTTPS dev server. Do not start, stop, restart, or kill it. The correct URL form is `https://localhost:5173/...`.
- Interactive Chrome commands require Austen's explicit permission in the current conversation. Read-only browser inspection is allowed when Austen asks for page evaluation.
- This repo has a shared Git index and many unrelated live edits. Use exact pathspecs for add and commit. Never use `git add .`, `git add -A`, broad restore, broad checkout, clean, reset, or stash.
- The original tracked creator components still exist in `HEAD` under `src/lib/features/browse/creators/`. They are useful as a logic reference, not as the visual baseline.
- `sequenceCount` is a profile-level count and may not equal the number of public sequences returned by the browse loader. Do not label it as a public count or use the difference as a hidden-work indicator.
- Public sequence metadata may contain owners excluded from the visible directory. Apply creator visibility rules before presenting aggregate creator counts.
- The current creator search is client-side over loaded pages. “Search all creators” would be a false claim until the backend/query strategy changes.
- `CreatorLibraryCard.svelte` demonstrates work previews but uses per-creator reads in its current data path. Copying that path would create an N+1 problem.
- The old card grid extracted a dominant color from every visible avatar. That work was removed in the rejected draft. Do not casually reintroduce it across a large virtualized result set.
- `COMMUNITY_TABS` still contains a dormant stale Creators entry. It appears to have no consumers beyond its getter, but remove it only after the dead-code process confirms that.
- Virtualization is useful at scale but constrains editorial composition and dynamic responsive layouts. Decide whether the chosen concept needs one virtualized region, progressive loading, or a hybrid surface. Do not preserve `VirtualizedCreatorGrid` by inertia.
- The screenshot's wide empty margins are part of the current app shell and content max-width behavior. The redesign can reconsider the inner canvas, but it should not fight the shell with viewport hacks.

