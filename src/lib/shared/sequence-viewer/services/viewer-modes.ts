import type { ViewerMode } from "../state/viewer-state.svelte";
import type { ContentType, SplitConfig } from "./viewer-state-persistence";
import { t } from "#lib/shared/i18n/i18n.svelte.js";

/** One switchable view in the sequence viewer (rail + mobile bottom bar). */
export interface ViewerModeOption {
  /** The ViewerMode this option selects. */
  id: ViewerMode;
  /** Font Awesome class fragment, e.g. 'fa-play'. */
  icon: string;
  label: string;
  /** When true, the option is hidden unless WebGL2 is available. */
  requiresWebgl2?: boolean;
  /**
   * When true, the option is hidden unless the viewport is large enough to host
   * 3D (see `MIN_3D_VIEWPORT_PX` / `viewportFits3D`). The 3D viewer is not
   * phone-friendly yet, so it is withheld on small screens.
   */
  requiresLargeViewport?: boolean;
  /**
   * When true, the option is withheld unless the current user has Post Studio
   * early access (`canAccessPostStudio()` in services/post-studio-access.ts).
   */
  requiresPostStudioAccess?: boolean;
}

/**
 * Single source of truth for the viewer's switchable views.
 * Consumed by ViewerContentRail (desktop) and ViewerModeBottomBar (mobile).
 * Order is intentional: Side-by-Side first, then single views by value.
 */
export const VIEWER_MODE_OPTIONS: ViewerModeOption[] = [
  { id: "split", icon: "fa-columns", label: "Side by Side" },
  { id: "animation", icon: "fa-play", label: "2D Animation" },
  {
    id: "animation-3d",
    icon: "fa-cube",
    label: "3D Animation",
    requiresWebgl2: true,
    requiresLargeViewport: true,
  },
  { id: "card", icon: "fa-grip", label: "Card" },
  { id: "videos", icon: "fa-video", label: "Performances" },
  // Tunnel remains a direct art view. Mandala opens from the workspace card,
  // where its collection and creation controls already live.
  { id: "tunnel", icon: "fa-fan", label: "Tunnel" },
  // Composing a vertical post is a viewer surface, not a child of the share
  // sheet: the viewer already owns every other way a sequence is turned into
  // something (card export, video export, tunnel, mandala, practice), and
  // Share owns distribution. Listing it here is what gives it a real entry
  // point in both switchers instead of a button buried two clicks into a modal.
  // Early access while unfinished: admins and per-user grants only.
  {
    id: "post-studio",
    icon: "fa-wand-magic-sparkles",
    label: "Post Studio",
    requiresPostStudioAccess: true,
  },
];

/**
 * What a switcher hands back when one of its options is picked. `split` is
 * excluded because both switchers route it to their own `onSelectSplit` — it
 * configures two panes rather than selecting a single view. Everything else,
 * including surfaces like `post-studio` that are not legal split-pane contents,
 * is selectable.
 */
export type SelectableViewerMode = Exclude<ViewerMode, "split">;

/** Practice is a toggle, not a ViewerMode. Rendered as its own item in both switchers. */
export const PRACTICE_OPTION = {
  icon: "fa-signal",
  label: "Practice",
} as const;

/** Resolve display copy when the view is rendered so locale changes stay live. */
export function viewerModeLabel(id: ViewerMode): string {
  switch (id) {
    case "split":
      return t("viewer_ui_side_by_side");
    case "animation":
      return t("viewer_ui_2d_animation");
    case "animation-3d":
      return t("viewer_ui_3d_animation");
    case "card":
      return t("viewer_ui_card");
    case "videos":
      return t("viewer_ui_performances");
    case "tunnel":
      return t("viewer_ui_tunnel");
    case "post-studio":
      return t("viewer_ui_post_studio");
    default:
      return t("viewer_ui_sequence");
  }
}

/**
 * Filter helper: drops WebGL2-only options when WebGL2 is unavailable,
 * large-viewport-only options (3D) when the viewport is too small to host
 * them, and early-access options (Post Studio) when access isn't granted.
 * `postStudioAccess` defaults to false — hidden unless the caller proves
 * access — so a call site that forgets the check fails closed.
 */
export function viewerModeOptions(
  webgl2Available: boolean,
  viewportFits3D = true,
  postStudioAccess = false
): ViewerModeOption[] {
  return VIEWER_MODE_OPTIONS.filter(
    (m) =>
      (!m.requiresWebgl2 || webgl2Available) &&
      (!m.requiresLargeViewport || viewportFits3D) &&
      (!m.requiresPostStudioAccess || postStudioAccess)
  );
}

/**
 * Coerce a single content type away from 3D when the viewport can't host it.
 * `'animation-3d' → 'animation'` when `!fits3D`; everything else untouched.
 * Pure — used by the viewer-state getters so a persisted 3D preference renders
 * as 2D on a small screen without overwriting the stored preference.
 */
export function coerce3DContent(
  content: ContentType,
  fits3D: boolean
): ContentType {
  return !fits3D && content === "animation-3d" ? "animation" : content;
}

/** Coerce both panes of a split config away from 3D when the viewport can't host it. */
export function coerce3DSplit(
  config: SplitConfig,
  fits3D: boolean
): SplitConfig {
  if (fits3D) return config;
  return {
    leftPane: coerce3DContent(config.leftPane, fits3D),
    rightPane: coerce3DContent(config.rightPane, fits3D),
  };
}

/**
 * Bridge to the viewer's older three-value `ViewMode`
 * (`sequence-modal-persistence.ts`), which only the autoplay policy still
 * reads: motion never auto-starts on `'image'`. A restored `card` surface is
 * a still image, so an autoplay open on it stays still; every other surface
 * either animates or ignores playback.
 */
export function legacyViewModeFor(
  mode: ViewerMode
): "animation" | "image" | "split" {
  return mode === "card" ? "image" : "animation";
}

/**
 * An explicit render query is share-link state, so it outranks the viewer mode
 * remembered on this device. Without this bridge a `?render=3d` permalink can
 * reopen an unrelated local surface such as Performances while only changing
 * the renderer hidden underneath it.
 */
export function viewerModeForRenderMode(
  renderMode: "2d" | "3d" | null
): ViewerMode | undefined {
  if (renderMode === "3d") return "animation-3d";
  if (renderMode === "2d") return "animation";
  return undefined;
}

/**
 * The route page's initial viewer mode, resolved from its URL params.
 *
 * A scan boot always lands on the card (the physical artifact the visitor just
 * scanned). Otherwise a `pane` param is the canonical mode owner (the vw URL
 * slice wrote it), so the page passes no initial mode and lets the seeded
 * viewer state stand — a full-state link that was captured on the tunnel pane
 * with the 3D renderer warm carries BOTH `pane=tunnel` and `render=3d`, and
 * forcing the render-derived mode here would override the surface the sender
 * was actually looking at. The render-derived mode still applies to pane-less
 * `?render=` permalinks (minted before `pane` existed), where it outranks the
 * device-local remembered surface — see `viewerModeForRenderMode`.
 */
export function initialViewerModeForUrl(
  scanOrigin: boolean,
  pane: string | null,
  renderMode: "2d" | "3d" | null
): ViewerMode | undefined {
  if (scanOrigin) return "card";
  if (pane) return undefined;
  return viewerModeForRenderMode(renderMode);
}
