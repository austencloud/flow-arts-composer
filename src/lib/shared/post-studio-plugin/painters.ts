import {
  ANIMATION_OVERLAY_ROLE,
  POST_STUDIO_ROLE,
  findItem,
  stripModeFromRole,
  type PostTake,
  type PostVideoItem,
} from "@austencloud/video-editor/core";
import type {
  PainterEnv,
  PainterFactory,
  PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { deriveWord } from "$lib/shared/foundation/services/word-deriver";
import type { StaffTipTrack } from "$lib/shared/media-composition/domain/staff-tip-track";
import type { StripMode } from "$lib/shared/media-composition/domain/strip-view";
import { createBeatCarouselPainter } from "$lib/shared/media-composition/services/beat-carousel-painter";
import { createSequenceStripPainter } from "$lib/shared/media-composition/services/sequence-strip-painter";
import { createStaffEffectPainter } from "$lib/shared/media-composition/services/staff-effect-painter";
import { createTunnelTitlesPainter } from "$lib/shared/media-composition/services/tunnel-titles-painter";
import { itemIdFromStaffEffectRole } from "./compile-hooks";

/** The app state tka's painters read, owned by the editor that hosts them. */
export interface TkaPainterDeps {
  /** The sequence the post shows. */
  getSequence(): SequenceData;
  /** Whether the strips draw their progress bar. */
  showProgressBar(): boolean;
  /** The post's takes, for the take a video clip plays. */
  getTakes(): readonly Pick<PostTake, "id" | "takeKey">[];
  /** A take's staff ends, or null while none are found. */
  staffTrack(takeKey: string): StaffTipTrack | null;
  /** The beat overlay's painter, or null until it has loaded. */
  getOverlayPainter(): PostStudioLayerPainter | null;
}

/**
 * tka's painter factories, asked after the core text factory. Each returns
 * null for a role that is not its own. Painters are kept across calls the way
 * the editor keeps them: the carousel and the strips per sequence, the titles
 * and staff effects per clip, each reading the latest project and compile.
 *
 * This module and everything it reaches must never import the plugin index by
 * value: the workspace and the parity test will build the registry from it,
 * and a value import of the index would drag bound.ts and the plugin into the
 * render graph.
 */
export function createTkaPainters(
  deps: TkaPainterDeps
): readonly PainterFactory[] {
  let latest: PainterEnv | null = null;

  let carousel: {
    sequence: SequenceData;
    painter: PostStudioLayerPainter;
  } | null = null;
  const strips = new Map<
    StripMode,
    { sequence: SequenceData; painter: PostStudioLayerPainter }
  >();
  const titlesPainters = new Map<string, PostStudioLayerPainter>();
  const staffPainters = new Map<string, PostStudioLayerPainter>();

  function videoItem(itemId: string): PostVideoItem | null {
    if (!latest) return null;
    const found = findItem(latest.project, itemId)?.item;
    return found?.kind === "video" ? found : null;
  }

  const carouselFactory: PainterFactory = {
    id: "tka-carousel",
    create(role, env) {
      if (role !== POST_STUDIO_ROLE.carousel) return null;
      latest = env;
      const sequence = deps.getSequence();
      if (carousel?.sequence !== sequence) {
        carousel = { sequence, painter: createBeatCarouselPainter(sequence) };
      }
      return carousel.painter;
    },
  };

  const stripFactory: PainterFactory = {
    id: "tka-strips",
    create(role, env) {
      const mode = stripModeFromRole(role);
      if (!mode) return null;
      latest = env;
      const sequence = deps.getSequence();
      let entry = strips.get(mode);
      if (entry?.sequence !== sequence) {
        entry = {
          sequence,
          painter: createSequenceStripPainter({
            sequence,
            mode,
            showProgressBar: () => deps.showProgressBar(),
          }),
        };
        strips.set(mode, entry);
      }
      return entry.painter;
    },
  };

  const overlayFactory: PainterFactory = {
    id: "tka-overlay",
    create(role, env) {
      if (role !== ANIMATION_OVERLAY_ROLE) return null;
      latest = env;
      return deps.getOverlayPainter();
    },
  };

  const titlesFactory: PainterFactory = {
    id: "tka-titles",
    create(role, env) {
      const plan = env.compiled.titles.find((entry) => entry.role === role);
      if (!plan) return null;
      latest = env;
      const itemId = plan.itemId;
      let painter = titlesPainters.get(itemId);
      if (!painter) {
        painter = createTunnelTitlesPainter(
          () =>
            latest?.compiled.titles.find((entry) => entry.itemId === itemId) ??
            null,
          () => {
            const sequence = deps.getSequence();
            return simplifyRepeatedWord(sequence.word || deriveWord(sequence));
          }
        );
        titlesPainters.set(itemId, painter);
      }
      return painter;
    },
  };

  const staffFactory: PainterFactory = {
    id: "tka-staff",
    create(role, env) {
      const itemId = itemIdFromStaffEffectRole(role);
      if (itemId === null) return null;
      const found = findItem(env.project, itemId)?.item;
      if (found?.kind !== "video" || !found.staffEffect) return null;
      latest = env;
      let painter = staffPainters.get(itemId);
      if (!painter) {
        painter = createStaffEffectPainter({
          track: () => {
            const item = videoItem(itemId);
            const take = item
              ? deps.getTakes().find((entry) => entry.id === item.takeId)
              : null;
            return take ? deps.staffTrack(take.takeKey) : null;
          },
          effect: () => videoItem(itemId)?.staffEffect?.effect ?? null,
          fit: () => videoItem(itemId)?.fit ?? "cover",
        });
        staffPainters.set(itemId, painter);
      }
      return painter;
    },
  };

  return [
    carouselFactory,
    stripFactory,
    overlayFactory,
    titlesFactory,
    staffFactory,
  ];
}
