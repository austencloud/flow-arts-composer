/**
 * tn slice — tunnel kaleidoscope view state <-> URL payload.
 * Capture: per-field diff vs `DEFAULT_TUNNEL_VIEW_STATE` (null at defaults).
 * Seed: merge onto that same default, replacing (never merging with) the
 * recipient's own persisted state.
 *
 * `TunnelViewController` is a per-mount class constructed by `ArtPane.svelte`
 * with no app-global singleton behind it (unlike `an`/`ex`/`cd`'s borrowed
 * module stores), so this is a PURE instance seam — the same shape as `fx`.
 * It is simpler than `t3`'s MIXED pattern: `t3` splits seed (orchestrator,
 * where `viewer3DState` lives) from capture (`Viewer3DCanvas`, where the pane
 * state lives) because those two live in different scopes. Here both the
 * config and the chrome (`gridVisible`/`colors`/`section`/`presetRecipe`)
 * live on the one `TunnelViewController` instance, and that instance is
 * constructed in `ViewerSplitPane.svelte` — the shared controller both pane
 * surfaces and the persistent 2D canvas adopt — so seed and capture both
 * belong there. See `TunnelControllerSources.initialViewState`
 * in `tunnel-view-controller.svelte.ts` for the constructor-time seam this
 * slice feeds (mirrors Task 5's `createViewerState({ initialMode, persist })`).
 *
 *
 * Preset-by-value (the task's core constraint): `tka_tunnel_user_presets`
 * (`tunnel-user-presets.svelte.ts`) is the sender's own private preset list —
 * a recipient's browser does not have it, and a link must never create,
 * reference, or write an entry there. `TunnelViewState.presetRecipe` already
 * satisfies this structurally, by construction, not by anything this slice
 * adds: `TunnelPresetRecipe.config` is ALWAYS a frozen clone of concrete
 * `TunnelConfig` values (`cloneTunnelConfig`, applied by every recipe
 * constructor and by `cloneTunnelPresetRecipe`) — never a live reference into
 * the preset list, whether the recipe's `kind` is `"built-in"` or `"saved"`.
 * So capturing `presetRecipe` verbatim already carries only concrete values;
 * there is no id to resolve. The `id`/`name`/`kind` fields ride along too —
 * `TunnelPresetBrowser.svelte` reads `presetRecipe.id` to highlight the
 * matching tile, which works for a shared built-in id and degrades to no
 * highlight (not an error) for a "saved" id the recipient doesn't have. `id`
 * is an opaque preset identifier (a built-in slug or a locally-generated
 * saved-preset id), not a user identifier, so it carries no privacy cost.
 *
 * ENCODED: `config` (as a `Partial<TunnelConfig>` patch — only the fields
 * that differ from `DEFAULT_TUNNEL_VIEW_STATE.config`), `gridVisible`,
 * `colors` (whole `TunnelPropColorState`, only when it differs from the
 * default — seeding runs it back through `resolveTunnelPropColorState`, so a
 * malformed or legacy payload normalizes instead of crashing), `section`,
 * `presetRecipe` (whole, only when non-null).
 *
 * EXCLUDED, with reasons — every `TunnelViewController` field NOT in
 * `TunnelViewState` (cross-checked against the controller's own persistence
 * `$effect`, which snapshots exactly the `TunnelViewState` shape and nothing
 * else):
 * - `active`: not view state at all — a derived on/off computed fresh from
 *   `artType` every mount (`controller.active = artType === "tunnel"`).
 * - `selectedArm` / `selectedPerformerId`: transient Speed-drawer / Performer
 *   Ring spotlight focus. The controller's own doc comments mark both
 *   explicitly as "NOT part of the config/persistence" — sharing a link must
 *   not force a spotlight onto the recipient's view.
 * - `lookEditorOpen`: transient Look-panel disclosure, documented on the field
 *   as "not saved choreography or a global preference."
 * - `#layers`, `#buildToken`, `buildError`: private build-pipeline state
 *   (baked layer geometry, an in-flight build token, the last build's error).
 *   Derived from the sequence/composition/config on every rebuild; encoding
 *   it would be stale the instant it arrived and it never appears in a
 *   `TunnelViewState` anyway.
 */
import { deepEqual } from "../viewer-url-state-codec";
import {
  DEFAULT_TUNNEL_VIEW_STATE,
  loadTunnelViewState,
  type TunnelViewState,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js";
import {
  cloneTunnelConfig,
  type TunnelConfig,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import {
  resolveTunnelPropColorState,
  type TunnelPropColorState,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.js";
import {
  cloneTunnelPresetRecipe,
  type TunnelPresetRecipe,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe.js";

/** Only the primitive-config fields that differ from the default. */
export type TnConfigPatch = Partial<TunnelConfig>;

export interface TnSlicePayload {
  config?: TnConfigPatch;
  gridVisible?: boolean;
  colors?: TunnelPropColorState;
  section?: TunnelViewState["section"];
  presetRecipe?: TunnelPresetRecipe | null;
}

/** The live controller, narrowed to what this slice reads. */
export interface TnSliceSource {
  config: TunnelConfig;
  gridVisible: boolean;
  colors: TunnelPropColorState;
  section: TunnelViewState["section"];
  presetRecipe: TunnelPresetRecipe | null;
}

/**
 * `full` emits every config field, the grid flag, the colors, and the section
 * (Share/Copy Link); the default diff form elides what matches
 * `DEFAULT_TUNNEL_VIEW_STATE`. `presetRecipe` rides whenever non-null in both.
 */
export function captureTnSlice(
  source: TnSliceSource,
  options: { full?: boolean } = {}
): TnSlicePayload | null {
  const full = options.full === true;
  const defaults = DEFAULT_TUNNEL_VIEW_STATE;
  const config: TnConfigPatch = {};
  if (full || source.config.fold !== defaults.config.fold)
    config.fold = source.config.fold;
  if (full || source.config.mirror !== defaults.config.mirror)
    config.mirror = source.config.mirror;
  if (full || source.config.flip !== defaults.config.flip)
    config.flip = source.config.flip;
  if (full || source.config.invert !== defaults.config.invert)
    config.invert = source.config.invert;
  if (full || source.config.echo !== defaults.config.echo)
    config.echo = source.config.echo;
  if (full || source.config.staggerSteps !== defaults.config.staggerSteps)
    config.staggerSteps = source.config.staggerSteps;
  if (
    full ||
    !deepEqual(source.config.speedOverrides, defaults.config.speedOverrides)
  ) {
    config.speedOverrides = { ...source.config.speedOverrides };
  }

  const payload: TnSlicePayload = {};
  if (Object.keys(config).length > 0) payload.config = config;
  if (full || source.gridVisible !== defaults.gridVisible) {
    payload.gridVisible = source.gridVisible;
  }
  // Compare in normalized space: the palette constants behind the default
  // state carry UPPERCASE hex while `resolveTunnelPropColorState` lowercases
  // any stored string, so a raw-constant compare would flag every loaded
  // state as non-default (the fx/t3 baseline trap, in casing form).
  const sourceColors = resolveTunnelPropColorState(source.colors);
  if (
    full ||
    !deepEqual(sourceColors, resolveTunnelPropColorState(defaults.colors))
  ) {
    payload.colors = sourceColors;
  }
  if (full || source.section !== defaults.section) payload.section = source.section;
  // Verbatim — see the module doc comment: the recipe's config is already a
  // frozen clone of concrete values, never a live reference into the user's
  // preset list, so no id-to-value resolution step is needed here.
  if (source.presetRecipe !== null) {
    payload.presetRecipe = cloneTunnelPresetRecipe(source.presetRecipe);
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

/**
 * Full `TunnelViewState` ready for `TunnelControllerSources.initialViewState`.
 * Encoded fields merge onto `DEFAULT_TUNNEL_VIEW_STATE` (the sender diffed
 * against the same baseline) — this REPLACES a disk read outright rather than
 * merging with one, so pair it with `persistViewState: false` at the call
 * site; the seam only substitutes the read.
 */
export function seedFromTnSlice(payload: TnSlicePayload): TunnelViewState {
  const defaults = DEFAULT_TUNNEL_VIEW_STATE;
  const patch = payload.config ?? {};
  const config: TunnelConfig = {
    fold: patch.fold ?? defaults.config.fold,
    mirror: patch.mirror ?? defaults.config.mirror,
    flip: patch.flip ?? defaults.config.flip,
    invert: patch.invert ?? defaults.config.invert,
    echo: patch.echo ?? defaults.config.echo,
    staggerSteps: patch.staggerSteps ?? defaults.config.staggerSteps,
    speedOverrides: patch.speedOverrides
      ? { ...patch.speedOverrides }
      : { ...defaults.config.speedOverrides },
  };
  return {
    config,
    gridVisible: payload.gridVisible ?? defaults.gridVisible,
    // Normalizes an absent, legacy, or malformed pair to a complete state,
    // routing the absent case through the default state so the result is
    // lowercase-normalized either way (see the capture-side comment).
    colors: resolveTunnelPropColorState(payload.colors ?? defaults.colors),
    section: payload.section ?? defaults.section,
    presetRecipe: payload.presetRecipe
      ? cloneTunnelPresetRecipe(payload.presetRecipe)
      : null,
  };
}

/**
 * Read-only reproduction of what a persistent (non-seeded) viewer holds, for
 * the own-link comparison (`ViewerUrlSession.isOverride`). `loadTunnelViewState`
 * has no side-effect writes and no boot migration that could diverge from
 * `DEFAULT_TUNNEL_VIEW_STATE` on a fresh visitor — unlike `t3`'s environment
 * store, there is no first-use fallback parameter to thread through here.
 */
export function persistedTnSliceFromStorage(
  options: { full?: boolean } = {}
): TnSlicePayload | null {
  return captureTnSlice(loadTunnelViewState(), options);
}
