/**
 * Reactive settings stand-in for the prop-type sync effect. The effect reads
 * prop choices through `getSettings()`, so the harness has to be real rune
 * state for the effect to re-run when a prop is picked.
 */
export const settingsHarness = $state({
  leftPropType: "staff",
  rightPropType: "staff",
});

export function resetSettingsHarness(): void {
  settingsHarness.leftPropType = "staff";
  settingsHarness.rightPropType = "staff";
}
