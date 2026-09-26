import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import {
  MAIN_TRACK_ID,
  POST_BOX,
  POST_MIN_ITEM_SECONDS,
  POST_PROJECT_SCHEMA_VERSION,
  createEmptyPostProject,
  createIdAllocator,
  textBox,
  type PostItem,
  type PostProject,
  type PostTrack,
} from "$lib/shared/media-composition/domain/post-project";
import {
  POST_ACT,
  type PostPlan,
} from "$lib/shared/media-composition/domain/post-plan";

/**
 * Converts a v1 act plan into a v2 project: every enabled act becomes a main
 * clip, its look becomes a `fill` overlay anchored to that clip, and its
 * captions become anchored text items. `normalizeProject` then lays the main
 * clips end to end and resolves every anchor - this function only has to get
 * each item's OWN fields and its anchor right.
 *
 * A performance act with no take left (removed since the plan was saved) has
 * nothing to compile into a clip, so it - and any look or caption that would
 * have hung off it - is dropped rather than carried over broken.
 *
 * An act still named after v1's built-in English defaults loses the name, so
 * the editor shows its own translated name instead.
 */
export function migratePostPlan(
  plan: PostPlan,
  context: { now: number }
): PostProject {
  const takes = new Map(plan.takes.map((entry) => [entry.id, entry]));
  // Only used to seed a deterministic, collision-free id allocator; its own
  // tracks and takes are replaced below.
  const draft = createEmptyPostProject({
    sequenceId: plan.sequenceId,
    now: context.now,
  });
  const nextId = createIdAllocator(draft);

  const mainItems: PostItem[] = [];
  // A breakdown's moves and carousel fill the same clip, so they need tracks
  // of their own; the animation and moves of different acts never overlap.
  const lookOverlays: PostItem[] = [];
  const carouselOverlays: PostItem[] = [];
  const captionItems: PostItem[] = [];
  /** Each kept act's new main item id and resulting length, for its looks and captions. */
  const actSpans = new Map<string, { itemId: string; duration: number }>();

  let keptCount = 0;
  for (const act of plan.acts) {
    if (!act.enabled) continue;

    if (act.kind === "card") {
      const fadeIn = keptCount === 0 ? 0 : 0.25;
      const id = nextId("card");
      mainItems.push({
        id,
        ...keptLabel(act),
        start: 0,
        duration: act.seconds,
        box: { ...POST_BOX.full },
        opacity: 1,
        fadeIn,
        fadeOut: 0,
        anchor: null,
        fill: false,
        kind: "card",
      });
      actSpans.set(act.id, { itemId: id, duration: act.seconds });
      keptCount += 1;
      continue;
    }

    if (!act.takeId || !takes.has(act.takeId)) continue;
    const take = takes.get(act.takeId)!;
    const sourceIn = act.sourceIn;
    const sourceOut = act.sourceOut ?? take.durationSeconds;
    const duration = (sourceOut - sourceIn) / act.speed;
    const fadeIn = keptCount === 0 ? 0 : 0.25;
    const id = nextId("video");
    const hasStrip = act.strip !== "off" || act.carousel;
    const box =
      act.layout === "split"
        ? { ...POST_BOX.top }
        : act.framing.area === "above-strip" && hasStrip
          ? { ...POST_BOX.aboveStrip }
          : { ...POST_BOX.full };

    mainItems.push({
      id,
      ...keptLabel(act),
      start: 0,
      duration,
      box,
      opacity: 1,
      fadeIn,
      fadeOut: 0,
      anchor: null,
      fill: false,
      kind: "video",
      takeId: act.takeId,
      sourceIn,
      sourceOut,
      // A slowed act's take would play back detuned if reused as-is, so
      // only a full-speed act keeps its sound (see `post-audio-plan.ts`).
      speed: act.speed,
      fit: act.framing.fit,
      zoom: act.framing.zoom,
      panX: act.framing.panX,
      panY: act.framing.panY,
      rotation: 0,
      flip: false,
      volume: act.speed === 1 ? 1 : 0,
    });
    actSpans.set(act.id, { itemId: id, duration });
    keptCount += 1;

    if (act.layout === "split") {
      lookOverlays.push({
        id: nextId("animation"),
        start: 0,
        duration: 1,
        box: { ...POST_BOX.bottom },
        opacity: 1,
        fadeIn,
        fadeOut: 0,
        anchor: { itemId: id, offset: 0 },
        fill: true,
        kind: "animation",
        overlay: true,
      });
    } else {
      if (act.strip !== "off") {
        lookOverlays.push({
          id: nextId("moves"),
          start: 0,
          duration: 1,
          box: { ...(act.carousel ? POST_BOX.stripSquare : POST_BOX.stripWide) },
          opacity: 1,
          fadeIn,
          fadeOut: 0,
          anchor: { itemId: id, offset: 0 },
          fill: true,
          kind: "moves",
          mode: act.strip,
        });
      }
      if (act.carousel) {
        carouselOverlays.push({
          id: nextId("carousel"),
          start: 0,
          duration: 1,
          box: {
            ...(act.strip !== "off" ? POST_BOX.stripCarousel : POST_BOX.stripWide),
          },
          opacity: 1,
          fadeIn,
          fadeOut: 0,
          anchor: { itemId: id, offset: 0 },
          fill: true,
          kind: "carousel",
        });
      }
    }
  }

  for (const caption of plan.captions) {
    const span = actSpans.get(caption.actId);
    const text = caption.text.trim();
    if (!span || text.length === 0) continue;
    const duration =
      Math.min(caption.endSeconds, span.duration) - caption.startSeconds;
    if (duration < POST_MIN_ITEM_SECONDS) continue;
    captionItems.push({
      id: nextId("text"),
      start: 0,
      duration,
      box: textBox(caption.position),
      opacity: 1,
      fadeIn: 0.15,
      fadeOut: 0.15,
      anchor: { itemId: span.itemId, offset: caption.startSeconds },
      fill: false,
      kind: "text",
      text,
      size: caption.size,
    });
  }

  const tracks: PostTrack[] = [
    { id: MAIN_TRACK_ID, hidden: false, locked: false, items: mainItems },
  ];
  // Captions go on the top track so no look draws over them. normalizeProject
  // moves an overlapping caption further up, never down among the looks.
  for (const items of [lookOverlays, carouselOverlays, captionItems]) {
    if (items.length === 0) continue;
    tracks.push({
      id: nextId("track"),
      hidden: false,
      locked: false,
      items,
    });
  }

  return normalizeProject({
    schemaVersion: POST_PROJECT_SCHEMA_VERSION,
    sequenceId: plan.sequenceId,
    takes: plan.takes,
    tracks,
    audio: plan.audio,
    updatedAt: context.now,
  });
}

/** The names v1 gave its template acts, in English whatever the language. */
const V1_DEFAULT_ACT_LABELS: Readonly<Record<string, string>> = {
  [POST_ACT.fullSpeed]: "Full speed",
  [POST_ACT.breakdown]: "Breakdown",
  [POST_ACT.card]: "Card",
};

function keptLabel(act: { id: string; label: string }): { label?: string } {
  return V1_DEFAULT_ACT_LABELS[act.id] === act.label ? {} : { label: act.label };
}
