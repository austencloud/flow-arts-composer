import {
  beatSeconds,
  hasGrid,
  postSecondsAtTrack,
  trackSecondsAt,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  MANDALA_DEFAULT_BEATS_PER_BAR,
  MANDALA_FALLBACK_BPM,
} from "#lib/shared/mandala/domain/mandala-shift-types.js";
import { shiftHoldBeats } from "#lib/shared/mandala/services/mandala-shift.js";
import type { PostMandalaItem } from "./item-kinds";

/**
 * A mandala clip's beat clock. With a music grid, beats count from the
 * music's downbeat and the clip is anchored on the hold boundary at or before
 * its start, so it opens on its first sequence and every shift lands on the
 * grid. Without one it runs at 120 BPM, four beats a bar, from its own start.
 *
 * This module must never import the plugin index by value: item-kinds is
 * reached from the index.
 */
export interface MandalaItemClock {
  beatsPerBar: number;
  bpm: number;
  /** The post has a beat grid; otherwise the fallback tempo runs. */
  hasGrid: boolean;
  /** Post seconds of beat 0. */
  anchorSeconds: number;
  /** Fractional beats from the anchor at a post second. */
  beatsAt(postSeconds: number): number;
}

export function mandalaItemClock(
  project: Pick<PostProject, "music">,
  item: Pick<PostMandalaItem, "start" | "shift">
): MandalaItemClock {
  const music = project.music;
  if (music && hasGrid(music)) {
    const { grid } = music;
    const beat = beatSeconds(grid);
    const hold = shiftHoldBeats(item.shift, grid.beatsPerBar);
    const beatsFromDownbeat =
      (trackSecondsAt(music, item.start) - grid.downbeatSeconds) / beat;
    const anchorBeats = Math.floor(beatsFromDownbeat / hold + 1e-9) * hold;
    const anchorSeconds = postSecondsAtTrack(
      music,
      grid.downbeatSeconds + anchorBeats * beat
    );
    return {
      beatsPerBar: grid.beatsPerBar,
      bpm: grid.bpm,
      hasGrid: true,
      anchorSeconds,
      beatsAt: (postSeconds) => (postSeconds - anchorSeconds) / beat,
    };
  }
  const beat = 60 / MANDALA_FALLBACK_BPM;
  return {
    beatsPerBar: MANDALA_DEFAULT_BEATS_PER_BAR,
    bpm: MANDALA_FALLBACK_BPM,
    hasGrid: false,
    anchorSeconds: item.start,
    beatsAt: (postSeconds) => (postSeconds - item.start) / beat,
  };
}

/**
 * The post second a frame of the clip shows. The compiled clip hands the
 * layer its source time (from `sourceIn`, at `speed`); the mandala counts
 * beats on the post's clock, so the frame is mapped back.
 */
export function mandalaItemPostSeconds(
  item: Pick<PostMandalaItem, "start" | "sourceIn" | "speed">,
  sourceTimeSeconds: number
): number {
  return item.start + (sourceTimeSeconds - item.sourceIn) / (item.speed || 1);
}
