/**
 * Trail Settings Sync Service Implementation
 *
 * Manages synchronization of trail settings between external sources,
 * local state, and the trail capture service.
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { TrailSettings } from "../domain/types/trail-types";
import { TrailMode as TrailModeEnum } from "../domain/types/trail-types";
import type { TrailCapturer } from "#lib/shared/animation-engine/services/trail-capturer.js";
import { saveTrailSettings } from "#lib/shared/animation-engine/utils/animation-panel-persistence.js";
export type RenderTriggerCallback = () => void;

export interface TrailSettingsSyncState {
  syncedSettings: TrailSettings | null;
  renderSignal: number;
}

export class TrailSettingsSynchronizer {
  // Reactive state - owned by service
  state = $state<TrailSettingsSyncState>({
    syncedSettings: null,
    renderSignal: 0,
  });

  private TrailCapturer: TrailCapturer | null = null;
  private renderTrigger: RenderTriggerCallback | null = null;

  initialize(
    TrailCapturer: TrailCapturer | null,
    renderTrigger: RenderTriggerCallback
  ): void {
    this.TrailCapturer = TrailCapturer;
    this.renderTrigger = renderTrigger;
  }

  handleSettingsChange(
    settings: TrailSettings,
    hasExternalSettings: boolean
  ): void {
    // Update service with new settings (if available)
    if (this.TrailCapturer) {
      this.TrailCapturer.updateSettings(settings);

      if (settings.mode === TrailModeEnum.OFF) {
        this.TrailCapturer.clearTrails();
      }
    }

    // Only save to localStorage if NOT using external settings
    if (!hasExternalSettings) {
      saveTrailSettings(settings);
    }

    // Signal render needed
    this.state.renderSignal++;
    this.renderTrigger?.();
  }

  handleExternalSettingsSync(
    externalSettings: TrailSettings | undefined
  ): void {
    if (externalSettings !== undefined) {
      // Only update if settings actually changed (deep comparison to prevent infinite loops)
      const settingsChanged =
        JSON.stringify(this.state.syncedSettings) !==
        JSON.stringify(externalSettings);
      if (settingsChanged) {
        // CRITICAL: Only mark as synced if we can actually update the TrailCapturer
        // If TrailCapturer is null (not initialized yet), don't set syncedSettings
        // This allows AnimationEngine's retry mechanism to work properly
        if (this.TrailCapturer) {
          this.TrailCapturer.updateSettings(externalSettings);
          // Only set syncedSettings AFTER successfully updating TrailCapturer
          this.state.syncedSettings = { ...externalSettings };
        }

        // Signal render needed
        this.state.renderSignal++;
        this.renderTrigger?.();
      }
    }
  }

  dispose(): void {
    this.TrailCapturer = null;
    this.renderTrigger = null;
    this.state.syncedSettings = null;
    this.state.renderSignal = 0;
  }
}
