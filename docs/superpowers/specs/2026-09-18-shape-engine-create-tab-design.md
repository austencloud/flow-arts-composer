# Shape Engine as a Create Tab

## Outcome

Shape Engine moves out of the Toys module and becomes a Create tab labeled
"Shape". Today it sits three taps deep: module switcher, Toys (eleventh
module), Shape Matrix tab. Create is the default landing module and its tabs
are one tap away, so the move puts the engine where people already are.

It also fits. Shape Engine realizes a pairing into a sequence
(`ModeCard.seq: SequenceData`), which is "start from the shape you want, get
the sequence that draws it": a creation method next to Construct, Generate,
Fuse and Tunnel, not a toy parked in Create.

This spec covers the relocation only. Handing a realized sequence into the
Create workspace (edit, extend, save to library) is a follow-up spec, as is the
future of the Toys module.

## Decisions

- Label "Shape" (one-word verb like every other Create tab; "Shape Engine"
  wraps on the phone strip). Tab id `shape-engine`, so the app URL is
  `/create/shape-engine`, matching the public `/shape-engine` destination.
- Order: after Generate, before Fuse. Construct and Generate build from
  nothing, Shape builds from a shape, Fuse and Tunnel need existing sequences.
- Shape Engine leaves Toys. Toys keeps Third Order and Hand Tunnel.
- Mounting mirrors Fuse and Tunnel: the tab owns the full workspace inside the
  tool-panel surface and loads lazily.
- Guests can open it, since `/shape-engine` is already fully public.

## Identity and navigation

- `BuildModeId` (`src/lib/shared/foundation/ui/ui-types.ts`) gains
  `"shape-engine"`.
- `CREATE_TABS` (`src/lib/shared/navigation/config/tab-definitions.ts`) gets a
  new entry immediately after `generate`:
  id `shape-engine`, `labelKey: "tab_create_shape_engine"`,
  `descKey: "tab_desc_create_shape_engine"`, label "Shape", icon
  `fa-border-all`, color `#2dd4bf` and gradient
  `linear-gradient(135deg, #5eead4 0%, #2dd4bf 100%)` carried over from the
  toy, `metadata: { isCreationMethod: true }`. Description: "Pick a shape
  pairing and get the sequence that draws it. Powered by Shape Engine."
- `CreateFrontDoor.METHOD_ORDER` becomes construct 0, generate 1,
  shape-engine 2, fuse 3, tunnel 4, assemble 5.
- The hand-kept create-tab id lists each add `"shape-engine"`:
  `VALID_CREATE_TABS` in `create-module-state.svelte.ts`, `CREATION_MODES` in
  `create-module/navigation-controller.svelte.ts`, `validCreateTabs` in
  `services/navigation-syncer.ts`, and `TAB_ORDERS.create` in
  `navigation-coordinator.svelte.ts` (after `generate`). Consolidating these
  four lists is out of scope because two of them still carry legacy `spell`
  handling.
- `GUEST_MODULE_ACCESS.create` in `guest-access-config.ts` adds
  `"shape-engine"`.
- i18n: `messages/en.json` gets `tab_create_shape_engine: "Shape"` and
  `tab_desc_create_shape_engine` with the description above; every locale that
  carries `tab_create_fuse` gets a translation of both. `tab_toys_shape_matrix`
  and `tab_desc_toys_shape_matrix` are removed from every locale.

## Mounting

- New `src/lib/features/create/shape-engine/ShapeEngineTab.svelte`, which is
  `features/toys/tabs/shape-matrix/ShapeMatrixToy.svelte` moved:
  `<ShapeMatrixApp variant="embedded" {persistence} />` inside a flex host
  with explicit width and height (the shared app sizes itself from its host).
- Persistence stays localStorage because module tabs do not own query state.
  New key `create-shape-engine-state-v1`. `restore()` reads the new key and
  falls back to the old `toys-shape-matrix-state-v1`; `persist()` writes the
  new key and removes the old one. The adapter lives in a small pure module
  (`shape-engine-persistence.ts`) so the fallback is unit-testable.
- `CreationToolPanelSlot.svelte` gets an
  `{:else if activeToolPanel === "shape-engine"}` branch with a `LazyMount`
  of `ShapeEngineTab.svelte`, same shape as the Fuse branch.
- `StandardWorkspaceLayout.ownsFullWorkspace` includes `shape-engine` so the
  sequence workspace stays collapsed and the engine gets the whole pane.
- Create's eager first-paint graph must not grow. `scripts/trace-create-three.cjs`
  is the check.

## Leaving Toys

- Remove the `shape-matrix` entry from `TOYS_TABS` and from the `ToysModule`
  loader map; the fallback tab becomes `third-order`. Delete
  `src/lib/features/toys/tabs/shape-matrix/`. Update the `TOYS_TABS` comment
  so it no longer names Shape Matrix as the first toy.
- Update `src/lib/shared/shape-matrix/README.md` so the consumer list names
  the Create tab instead of Toys.
- URL redirect: `module-definitions.ts` gains a cross-module section
  migration map next to `SECTION_ID_MIGRATIONS`, exposed as
  `normalizeNavigationTarget(moduleId, sectionId)`, where `toys` +
  `shape-matrix` resolves to module `create`, tab `shape-engine`. Every URL
  parser goes through it: `navigation-state.svelte.ts` at startup,
  `parsePathNavigation()` in the navigation coordinator (which re-parses the
  URL at boot and would otherwise override the first result), and the
  coordinator's popstate handler for old history entries. Stale persisted
  last-tab data that still says `toys/shape-matrix` falls to Toys' first tab
  through the existing unknown-tab fallback, which is acceptable.

## Verification

- Unit: the persistence adapter fallback (new key wins, old key is read once
  and removed on the next persist, invalid JSON yields null). The
  `toys/shape-matrix` redirect through `initializeNavigationHistory()` under
  jsdom (the harness `scan-atlas-route-migration.test.ts` already uses), so
  the boot-time parser is exercised, not only navigation-state.
- Type and lint gates: `npm run check` scope narrowed to the touched files
  where the project scripts allow, plus the existing unit suite.
- Browser, in the task worktree on a task-owned port: the Create front door
  shows Shape third; the tab strip shows Shape after Generate; the engine
  fills the pane at 375x667, 960x412, 1440x900 and 3840x2160; matrix settings
  survive a reload; `/toys/shape-matrix` lands on Shape; a guest session sees
  the tab.

## Out of scope

- Realized-sequence handoff into the Create workspace.
- Toys' future (dissolve, rehome Third Order and Hand Tunnel).
- Consolidating the four create-tab id lists.
