import type {
  CompositionSourceBinding,
  VideoEditorState,
} from "@austencloud/video-editor";
import {
  ANIMATION_OVERLAY_ROLE,
  findItem,
  stripModeFromRole,
  tunnelHookChromeOpacity,
  type MediaCompositionPreset,
  type PostItem,
} from "@austencloud/video-editor/core";
import type { EvaluatedFrameLayer } from "@austencloud/video-editor/render";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import {
  animationAppearanceForItem,
  cardOptionsForItem,
  tunnelHidesMandala,
} from "./post-item-render-options";
import {
  posterQrAppearance,
  type PostQrAppearance,
} from "./post-qr-image-appearance";

/*
 * What tka's sequence surfaces take for one media layer, as the editor canvas
 * passed it to the media layer before Task 14. TkaMediaSublayer derives each
 * prop through these; the media layer reads the QR image look.
 */

/**
 * Until its take is mapped, a layer drawn from the sequence holds the
 * opening pose, the engine's position 1, rather than going blank.
 */
export const OPENING_POSITION = 1;

// The tunnel carries none of the canvas's notation; grid, glyph and step
// number fade in as the item's opening ends and it carries on as the
// ordinary animation, on the same canvas.
export function hookChromeOpacity(
  editor: VideoEditorState,
  regionId: string
): number {
  const item = findItem(editor.project, regionId)?.item;
  if (item?.kind !== "animation" || !item.tunnelHook) return 1;
  const introEnd = item.start + (item.tunnelHook.seconds ?? item.duration);
  return tunnelHookChromeOpacity(editor.previewSeconds - introEnd);
}

/** Regions whose animation has its beat and letter painted over it. */
export function paintedLabelRegions(
  bindingFor: (role: string) => CompositionSourceBinding | null,
  preset: MediaCompositionPreset | null
): Set<string> {
  return new Set(
    bindingFor(ANIMATION_OVERLAY_ROLE)?.status === "ready" && preset
      ? preset.clips.flatMap((clip) =>
          clip.kind === "visual" && clip.sourceRole === ANIMATION_OVERLAY_ROLE
            ? [clip.regionId]
            : []
        )
      : []
  );
}

/** The card options a layer draws with: a card item's own settings over the viewer's. */
export function layerCardRenderOptions(
  cardRenderOptions: Partial<SequenceExportOptions> | null,
  sourceItem: PostItem | null
): Partial<SequenceExportOptions> | null {
  return cardOptionsForItem(
    cardRenderOptions,
    sourceItem?.kind === "card" ? sourceItem : null
  );
}

/** A QR image's look: its own, else the poster look of the card under it. */
export function layerQrAppearance(
  cardRenderOptions: Partial<SequenceExportOptions> | null,
  sourceItem: PostItem | null,
  underlyingItem: PostItem | null
): PostQrAppearance | undefined {
  return sourceItem?.kind === "image"
    ? (sourceItem.qrAppearance ??
        posterQrAppearance(
          cardRenderOptions,
          underlyingItem?.kind === "card" ? underlyingItem : null
        ))
    : undefined;
}

export function layerAnimationAppearance(
  layer: EvaluatedFrameLayer,
  sourceItem: PostItem | null
) {
  return animationAppearanceForItem(
    sourceItem?.kind === "animation" || sourceItem?.kind === "moves"
      ? sourceItem
      : null,
    !!layer.tunnelHook
  );
}

/** A card's saved scan link, which its QR shows. */
export function layerQrUrl(sourceItem: PostItem | null): string | undefined {
  return sourceItem?.kind === "card" ? sourceItem.qrUrl : undefined;
}

/** The mandala coming in as the tunnel hands over, 0 to 1. */
export function layerMandalaIn(
  editor: VideoEditorState,
  layer: EvaluatedFrameLayer,
  regionId: string,
  sourceItem: PostItem | null
): number {
  return !layer.tunnelHook &&
    sourceItem?.kind === "animation" &&
    tunnelHidesMandala(sourceItem)
    ? hookChromeOpacity(editor, regionId)
    : 1;
}

/** Whether the layer draws a take's footage rather than the sequence. */
function isVideoBinding(binding: CompositionSourceBinding): boolean {
  return binding.renderMode === "external-media";
}

export function layerSequencePosition(
  layer: EvaluatedFrameLayer,
  binding: CompositionSourceBinding
): number | undefined {
  const isVideo = isVideoBinding(binding);
  return layer.sequencePosition ?? (isVideo ? undefined : OPENING_POSITION);
}

export function layerAnimationTimeSeconds(
  layer: EvaluatedFrameLayer,
  binding: CompositionSourceBinding
): number | undefined {
  const isVideo = isVideoBinding(binding);
  return layer.animationTimeSeconds ?? (isVideo ? undefined : 0);
}

export function layerBreakdownMotion(
  role: string,
  sourceItem: PostItem | null
): boolean {
  return sourceItem?.kind === "moves" || stripModeFromRole(role) !== null;
}

export function layerBreakdownMode(sourceItem: PostItem | null) {
  return sourceItem?.kind === "moves" ? sourceItem.mode : undefined;
}
