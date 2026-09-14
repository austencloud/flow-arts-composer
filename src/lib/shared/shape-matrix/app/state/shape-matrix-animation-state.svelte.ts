import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { PillId } from "$lib/shared/animation-panel/pill-nav/pill-types";
import { loadActivePill } from "$lib/shared/animation-panel/state/active-pill-persistence";
import {
  HERO_TIP_EFFECT_MAP,
  HERO_TRAIL_PRESET,
} from "$lib/shared/landing/data/hero-trail-preset";

/**
 * Presentation state for the Shape Matrix hero. It is intentionally separate
 * from matrix navigation: changing a flower or relationship replaces the
 * sequence, while playback, display, effects, and disassembly remain stage
 * choices.
 */
/**
 * The pages of the wide host's customize workspace. The rail's saved choice
 * is shared with every sidebar in the app, so a page this host does not have
 * (Export, Grid) falls back to Effects instead of opening on nothing.
 */
const CUSTOMIZE_SECTIONS: readonly PillId[] = [
  "effects",
  "props",
  "motion",
  "effort",
  "playback",
  "display",
];

type SequencePreview = {
  word?: string | null;
  steps?: ReadonlyArray<{ letter?: string | null }> | null;
};

export function createShapeMatrixAnimationState() {
  const scope = createAnimationScope({ persistence: "ephemeral" });
  scope.settings.setBpm(60);
  scope.visibility.setBpm(60);
  scope.visibility.setPathPolicy({
    pathShape: "arc",
    motionAwarePaths: false,
  });
  scope.effects.replace({
    ...scope.effects.config,
    trails: {
      ...scope.effects.trails,
      thickness: Math.max(1, HERO_TRAIL_PRESET.lineWidth - 2),
      brightness: HERO_TRAIL_PRESET.maxOpacity,
      trackingMode: "right_end",
    },
    tipEffectMap: { ...HERO_TIP_EFFECT_MAP },
    activeEffect: "trails",
  });

  let playing = $state(true);
  let playbackMode = $state<PlaybackMode>("continuous");
  let activeSection = $state<PillId | null>(null);
  let closeRequest = $state(0);
  let disassembled = $state(false);
  let previewSequence = $state.raw<SequencePreview | null>(null);

  function setPlaying(next: boolean): void {
    playing = next;
  }

  function togglePlaying(): void {
    playing = !playing;
  }

  function setBpm(next: number): void {
    scope.settings.setBpm(next);
    scope.visibility.setBpm(next);
  }

  function setPlaybackMode(next: PlaybackMode): void {
    playbackMode = next;
    scope.visibility.setPlaybackMode(next);
  }

  function setActiveSection(next: PillId | null): void {
    activeSection = next;
  }

  function requestDisassembled(next: boolean): void {
    disassembled = next;
  }

  /**
   * A wide host opens every ability at once, on the page the rail last
   * showed, so the workspace resumes where it was left rather than always on
   * Effects. Compact hosts open one section from its own pill instead.
   */
  function openCustomize(): void {
    if (activeSection !== null) return;
    const remembered = loadActivePill("effects");
    activeSection = CUSTOMIZE_SECTIONS.includes(remembered)
      ? remembered
      : "effects";
  }

  function showRelationships(): void {
    if (activeSection === null) return;
    activeSection = null;
    closeRequest += 1;
  }

  return {
    scope,
    get previewSequence() {
      return previewSequence;
    },
    setPreviewSequence(next: SequencePreview | null) {
      previewSequence = next;
    },
    get playing() {
      return playing;
    },
    get bpm() {
      return scope.settings.bpm;
    },
    get playbackMode() {
      return playbackMode;
    },
    get activeSection() {
      return activeSection;
    },
    get closeRequest() {
      return closeRequest;
    },
    get disassembled() {
      return disassembled;
    },
    setPlaying,
    togglePlaying,
    setBpm,
    setPlaybackMode,
    setActiveSection,
    openCustomize,
    requestDisassembled,
    showRelationships,
  };
}

export type ShapeMatrixAnimationState = ReturnType<
  typeof createShapeMatrixAnimationState
>;
