import { t } from "$lib/shared/i18n/i18n.svelte.js";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
import {
  POST_STUDIO_ROLE,
  ANIMATION_OVERLAY_ROLE,
  stripModeFromRole,
  stripRole,
  findItem,
  itemIdFromTitlesRole,
  type PostVideoItem,
} from "@austencloud/video-editor/core";
import {
  itemIdFromMovesAnimationRole,
  itemIdFromStaffEffectRole,
  staffEffectRole,
} from "$lib/shared/post-studio-plugin";
import type { StripMode } from "$lib/shared/media-composition/domain/strip-view";
import type {
  CompositionSourceBinding,
  PluginBindings,
  Translate,
  VideoEditorState,
} from "@austencloud/video-editor";
import type { PostStudioLayerPainter } from "@austencloud/video-editor/render";
import { createBeatCarouselPainter } from "$lib/shared/media-composition/services/beat-carousel-painter";
import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { createStaffEffectPainter } from "$lib/shared/media-composition/services/staff-effect-painter";
import { createTunnelTitlesPainter } from "$lib/shared/media-composition/services/tunnel-titles-painter";
import { createStaffTipAnalysis } from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
import { loadAnimationOverlayPainter } from "$lib/shared/media-composition/services/animation-overlay-painter-registry";
import { qrImageForAppearance } from "./post-qr-image-appearance";
import { useTkaEditor } from "./tka-editor-context";

/**
 * The sources and painters of tka's own roles: the staff effects, the titles,
 * the moves and their strips, the beat carousel, the beat and letter overlay,
 * the sequence animation and the choreo card. The workspace answers the core
 * roles (images, take videos, text) and asks these second.
 */
export function createTkaBindings(env: {
  editor: VideoEditorState;
  t: Translate;
  previewUrl(takeId: string, url: string | null): string | null;
}): PluginBindings {
  // createBindings runs during the workspace's initialisation, inside
  // TkaEditorScope, so the context can be read here. Its editor is
  // `env.editor` with tka's members typed. The labels below are tka keys,
  // which the package's `t` does not carry, so they use tka's own `t`.
  const tka = useTkaEditor();
  const editor = tka.editor;
  tka.previews.resolve = env.previewUrl;

  // ---- What each layer draws -----------------------------------------------

  const carouselPainter = $derived(
    createBeatCarouselPainter(tka.displaySequence)
  );
  const animationVisibility = getAnimationVisibilityManager();
  let progressBarVisible = $state(
    animationVisibility.getVisibility("progressBar")
  );
  function syncProgressBarVisibility(): void {
    progressBarVisible = animationVisibility.getVisibility("progressBar");
  }
  animationVisibility.registerObserver(syncProgressBarVisibility);
  const stripPainters = $derived(
    new Map<StripMode, PostStudioLayerPainter>(
      (["arrows", "mandala", "alternate"] as const).map((mode) => [
        mode,
        createSequenceStripPainter({
          sequence: tka.displaySequence,
          mode,
          showProgressBar: () => progressBarVisible,
        }),
      ])
    )
  );
  tka.strips.painterFor = (mode) =>
    stripPainters.get(mode as StripMode) ?? null;

  /** One painter per titles clip: the sequence's name and how to say it. */
  const titlesPainters = new Map<string, PostStudioLayerPainter>();
  function titlesPainterFor(itemId: string): PostStudioLayerPainter {
    let painter = titlesPainters.get(itemId);
    if (!painter) {
      painter = createTunnelTitlesPainter(
        () =>
          editor.compiled?.titles.find((plan) => plan.itemId === itemId) ??
          null,
        () =>
          simplifyRepeatedWord(
            tka.displaySequence.word || deriveWord(tka.displaySequence)
          )
      );
      titlesPainters.set(itemId, painter);
    }
    return painter;
  }

  /** Where each take's LED staffs are, found once per video. */
  const staffTips = createStaffTipAnalysis();
  $effect(() => {
    for (const take of editor.takes) staffTips.ensure(take.takeKey);
  });
  tka.staffTips = staffTips;

  function videoItem(itemId: string): PostVideoItem | null {
    const found = findItem(editor.project, itemId)?.item;
    return found?.kind === "video" ? found : null;
  }

  /** One painter per clip, reading its effect and its take's staff ends live. */
  const staffPainters = new Map<string, PostStudioLayerPainter>();
  function staffPainterFor(itemId: string): PostStudioLayerPainter {
    let painter = staffPainters.get(itemId);
    if (!painter) {
      painter = createStaffEffectPainter({
        track: () => {
          const item = videoItem(itemId);
          const take = item
            ? editor.takes.find((entry) => entry.id === item.takeId)
            : null;
          return take ? staffTips.track(take.takeKey) : null;
        },
        effect: () => videoItem(itemId)?.staffEffect?.effect ?? null,
        fit: () => videoItem(itemId)?.fit ?? "cover",
      });
      staffPainters.set(itemId, painter);
    }
    return painter;
  }

  let overlayVersion = 0;
  $effect(() => {
    const drawn = tka.displaySequence;
    const version = ++overlayVersion;
    tka.overlay.error = null;
    void loadAnimationOverlayPainter(drawn)
      .then((painter) => {
        if (version === overlayVersion) {
          tka.overlay.painter = painter;
          tka.overlay.sequence = drawn;
        }
      })
      .catch((error: unknown) => {
        console.error("[PostStudio] Beat overlay unavailable:", error);
        if (version === overlayVersion) {
          tka.overlay.painter = null;
          tka.overlay.error =
            "Could not prepare the animation. Reload the saved post to retry.";
        }
      });
  });

  function painted(
    roleKey: string,
    label: string,
    painter: PostStudioLayerPainter
  ): CompositionSourceBinding {
    return {
      roleKey,
      kind: "image",
      label,
      previewUrl: null,
      renderMode: "painted",
      painter,
      status: tka.displaySequence.steps.length > 0 ? "ready" : "missing",
    };
  }

  function bindingFor(role: string): CompositionSourceBinding | null {
    const staffItemId = itemIdFromStaffEffectRole(role);
    if (staffItemId) {
      return {
        roleKey: role,
        kind: "image",
        label: t("post_staff_effect"),
        previewUrl: null,
        renderMode: "painted",
        painter: staffPainterFor(staffItemId),
        status: "ready",
        bareWhileCropping: true,
      };
    }
    const titlesItemId = itemIdFromTitlesRole(role);
    if (titlesItemId) {
      return painted(
        role,
        t("post_editor_kind_titles"),
        titlesPainterFor(titlesItemId)
      );
    }
    if (itemIdFromMovesAnimationRole(role)) {
      return {
        roleKey: role,
        kind: "sequence-animation",
        label: t("share_studio_deep_moves"),
        previewUrl: null,
        renderMode: "sequence-animation",
        status: tka.displaySequence.steps.length > 0 ? "ready" : "missing",
      };
    }
    const strip = stripModeFromRole(role);
    if (strip) {
      const painter = stripPainters.get(strip);
      return painter
        ? painted(role, t("share_studio_deep_moves"), painter)
        : null;
    }
    switch (role) {
      case POST_STUDIO_ROLE.animation:
        return {
          roleKey: role,
          kind: "sequence-animation",
          label: t("share_studio_deep_animation"),
          previewUrl: tka.animationPreviewUrl,
          previewType: tka.animationPreviewType,
          renderMode: "sequence-animation",
          status:
            tka.displaySequence.steps.length > 0 || tka.animationPreviewUrl
              ? "ready"
              : tka.isPreparingAnimation
                ? "preparing"
                : "missing",
        };
      case POST_STUDIO_ROLE.carousel:
        return painted(
          role,
          t("share_studio_deep_beat_carousel"),
          carouselPainter
        );
      case ANIMATION_OVERLAY_ROLE:
        return tka.overlay.painter
          ? painted(
              role,
              t("share_studio_deep_beat_and_letter"),
              tka.overlay.painter
            )
          : null;
      case POST_STUDIO_ROLE.card:
        return {
          roleKey: role,
          kind: "choreo-card",
          label: t("share_studio_deep_choreo_card"),
          previewUrl: tka.cardPreviewUrl,
          previewType: "image",
          renderMode: "choreo-card",
          status:
            tka.displaySequence.steps.length > 0 || tka.cardPreviewUrl
              ? "ready"
              : tka.isPreparingCard
                ? "preparing"
                : "missing",
        };
      default:
        return null;
    }
  }

  // tka's layers read another role's source through the context (the media
  // sublayer asks whether the overlay paints the labels). Only these roles
  // are asked, and the workspace's core roles never answer them.
  tka.bindingFor = bindingFor;

  /**
   * The changed notation and the animation overlay are prepared, and the
   * viewer's panels are still. A post with moves waits for the overlay of the
   * sequence on screen.
   */
  function renderStatus(): { ready: boolean; error: string | null } {
    return {
      ready:
        !tka.sequenceBusy &&
        !tka.sequenceError &&
        (!editor.project.tracks.some((track) =>
          track.items.some((item) => item.kind === "moves")
        ) ||
          (tka.overlay.sequence === tka.displaySequence &&
            !tka.overlay.error)) &&
        !tka.viewerMoving,
      error: tka.sequenceError ?? tka.overlay.error ?? null,
    };
  }

  /** Both looks of every image, so a QR image's redraw is ready to capture. */
  async function prepareRender(): Promise<void> {
    await Promise.all(
      editor.project.tracks.flatMap((track) =>
        track.items.flatMap((item) => {
          if (item.kind !== "image") return [];
          const url = editor.imageUrl(item.imageId);
          if (!url) return [];
          return [
            qrImageForAppearance(url, "light"),
            qrImageForAppearance(url, "dark"),
          ];
        })
      )
    );
  }

  /** Beside Undo and Redo: the changed notation failed, or is being prepared. */
  function notice(): { message: string; alert: boolean } | null {
    if (tka.sequenceError) return { message: tka.sequenceError, alert: true };
    return (editor.project.mirrored ||
      editor.project.sequenceActions?.length) &&
      tka.sequenceBusy
      ? { message: "Preparing the changed animation and cards…", alert: false }
      : null;
  }

  /** Every painter of these roles, keyed the way the exporter looks them up. */
  function exportPainters(): Map<string, PostStudioLayerPainter> {
    const painters = new Map<string, PostStudioLayerPainter>([
      [POST_STUDIO_ROLE.carousel, carouselPainter],
    ]);
    for (const [mode, painter] of stripPainters) {
      painters.set(stripRole(mode), painter);
    }
    if (tka.overlay.painter)
      painters.set(ANIMATION_OVERLAY_ROLE, tka.overlay.painter);
    for (const plan of editor.compiled?.titles ?? []) {
      painters.set(plan.role, titlesPainterFor(plan.itemId));
    }
    for (const track of editor.project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && item.staffEffect) {
          painters.set(staffEffectRole(item.id), staffPainterFor(item.id));
        }
      }
    }
    return painters;
  }

  return {
    bindingFor,
    exportPainters,
    renderStatus,
    prepareRender,
    notice,
    stageHeldElsewhere: () => tka.viewerActive,
    dispose() {
      animationVisibility.unregisterObserver(syncProgressBarVisibility);
      staffTips.dispose();
    },
  };
}
