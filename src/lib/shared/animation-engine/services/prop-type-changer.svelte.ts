/**
 * Prop Type Change Service Implementation
 *
 * Watches for prop type changes from settings and triggers texture reloading.
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { SettingsState } from "#lib/shared/settings/state/settings-state.svelte.js";
export interface PropTypeChangerState {
  leftPropType: string;
  rightPropType: string;
  legacyPropType: string;
  textureReloadSignal: number;
}

export class PropTypeChanger {
  // Reactive state - owned by service
  state = $state<PropTypeChangerState>({
    leftPropType: "staff",
    rightPropType: "staff",
    legacyPropType: "staff",
    textureReloadSignal: 0,
  });

  checkForChanges(settingsService: SettingsState | null): void {
    if (!settingsService) return;

    const settings = settingsService.currentSettings;
    const newLeftPropType =
      settings.leftPropType || settings.propType || "staff";
    const newRightPropType = settings.rightPropType || settings.propType || "staff";

    if (
      newLeftPropType !== this.state.leftPropType ||
      newRightPropType !== this.state.rightPropType
    ) {
      // Update reactive state - component will react via $derived/$effect
      this.state.leftPropType = newLeftPropType;
      this.state.rightPropType = newRightPropType;
      this.state.legacyPropType = newLeftPropType; // Legacy compatibility

      // Signal texture reload needed
      this.state.textureReloadSignal++;
    }
  }

  overridePropTypes(leftPropType: string, rightPropType: string): void {
    if (
      leftPropType !== this.state.leftPropType ||
      rightPropType !== this.state.rightPropType
    ) {
      this.state.leftPropType = leftPropType;
      this.state.rightPropType = rightPropType;
      this.state.legacyPropType = leftPropType;
      this.state.textureReloadSignal++;
    }
  }

  dispose(): void {
    this.state.leftPropType = "staff";
    this.state.rightPropType = "staff";
    this.state.legacyPropType = "staff";
    this.state.textureReloadSignal = 0;
  }
}
