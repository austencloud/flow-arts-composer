/**
 * Video Record Settings State
 *
 * Manages reference view preferences with localStorage persistence.
 * Uses unified persistence utility for consistent auto-save behavior.
 */

import { createPersistenceHelper } from "#lib/shared/state/utils/persistent-state.js";

export type ReferenceViewType = "none" | "animation" | "grid";

export interface AnimationSettings {
  speed: number; // 0.25 to 2.0
  showTrails: boolean;
  leftMotionVisible: boolean;
  rightMotionVisible: boolean;
}

export interface GridSettings {
  animated: boolean; // false = static, true = BPM-synced
  bpm: number; // Only used when animated is true
}

export interface VideoRecordSettings {
  // Desktop: 'none' or 'animation'
  // Mobile: 'animation' or 'grid'
  referenceView: ReferenceViewType;

  animationSettings: AnimationSettings;
  gridSettings: GridSettings;
}

const DEFAULT_SETTINGS: VideoRecordSettings = {
  referenceView: "animation",
  animationSettings: {
    speed: 1.0,
    showTrails: true,
    leftMotionVisible: true,
    rightMotionVisible: true,
  },
  gridSettings: {
    animated: false,
    bpm: 60,
  },
};

export function normalizeLegacyVideoRecordSettings(
  value: unknown
): VideoRecordSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  const source = value as Record<string, unknown>;
  const animationSource =
    source.animationSettings &&
    typeof source.animationSettings === "object" &&
    !Array.isArray(source.animationSettings)
      ? (source.animationSettings as Record<string, unknown>)
      : {};
  const animationSettings = { ...animationSource };
  animationSettings.leftMotionVisible ??= animationSource.blueMotionVisible;
  animationSettings.rightMotionVisible ??= animationSource.redMotionVisible;
  delete animationSettings.blueMotionVisible;
  delete animationSettings.redMotionVisible;
  return { ...source, animationSettings } as unknown as VideoRecordSettings;
}

const settingsPersistence = createPersistenceHelper({
  key: "tka-video-record-settings",
  defaultValue: DEFAULT_SETTINGS,
  migrate: normalizeLegacyVideoRecordSettings,
});

export function createVideoRecordSettings() {
  let settings = $state<VideoRecordSettings>(settingsPersistence.load());

  // Auto-save on changes
  $effect.root(() => {
    $effect(() => {
      // Access all properties to track changes
      void settings.referenceView;
      void settings.animationSettings.speed;
      void settings.animationSettings.showTrails;
      void settings.animationSettings.leftMotionVisible;
      void settings.animationSettings.rightMotionVisible;
      void settings.gridSettings.animated;
      void settings.gridSettings.bpm;

      settingsPersistence.setupAutoSave(settings);
    });
  });

  return {
    get current() {
      return settings;
    },

    setReferenceView(view: ReferenceViewType) {
      settings.referenceView = view;
    },

    setAnimationSpeed(speed: number) {
      settings.animationSettings.speed = Math.max(0.25, Math.min(2.0, speed));
    },

    setShowTrails(show: boolean) {
      settings.animationSettings.showTrails = show;
    },

    setLeftMotionVisible(visible: boolean) {
      settings.animationSettings.leftMotionVisible = visible;
    },

    setRightMotionVisible(visible: boolean) {
      settings.animationSettings.rightMotionVisible = visible;
    },

    setGridAnimated(animated: boolean) {
      settings.gridSettings.animated = animated;
    },

    setGridBpm(bpm: number) {
      settings.gridSettings.bpm = Math.max(30, Math.min(200, bpm));
    },

    reset() {
      settings = { ...DEFAULT_SETTINGS };
    },
  };
}

export type VideoRecordSettingsState = ReturnType<
  typeof createVideoRecordSettings
>;
