/**
 * Prop presets: ten saved prop setups the performer can switch between.
 *
 * The one owner of what a preset holds, how it is compared with the current
 * setup, and which settings applying it writes. The Props settings page and
 * the Alt+1..0 shortcuts all go through here, so a preset can never apply
 * partially from one entry point and fully from another.
 *
 * A preset is a snapshot. Applying one never links it to later edits: a
 * preset changes only when the performer saves to it.
 */

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
import type { AppSettings, PropPreset } from "./app-settings";

export const PROP_PRESET_SLOT_COUNT = 10;

function samePair(prop: PropType): PropPreset {
  return { leftPropType: prop, rightPropType: prop, catDogMode: false };
}

/** What a new account starts with, and what "Reset to defaults" restores. */
export const DEFAULT_PROP_PRESETS: readonly PropPreset[] = [
  samePair(PropType.STAFF),
  samePair(PropType.FAN),
  samePair(PropType.CLUB),
  samePair(PropType.BUUGENG),
  samePair(PropType.MINIHOOP),
  samePair(PropType.TRIAD),
  samePair(PropType.DOUBLESTAR),
  samePair(PropType.BIGDOUBLESTAR),
  samePair(PropType.QUIAD),
  { leftPropType: PropType.STAFF, rightPropType: PropType.FAN, catDogMode: true },
];

/** A fresh copy of the defaults, safe to store or mutate. */
export function defaultPropPresets(): PropPreset[] {
  return DEFAULT_PROP_PRESETS.map((preset) => ({ ...preset }));
}

type SetupSettings = Pick<
  AppSettings,
  | "propType"
  | "leftPropType"
  | "rightPropType"
  | "catDogMode"
  | "leftBuugengFlipped"
  | "rightBuugengFlipped"
>;

/** The current prop setup, in the same shape a preset stores. */
export function presetFromSettings(settings: SetupSettings): PropPreset {
  const left = settings.leftPropType || settings.propType || PropType.STAFF;
  const right = settings.rightPropType || settings.propType || PropType.STAFF;
  return {
    leftPropType: left,
    rightPropType: right,
    catDogMode: settings.catDogMode ?? false,
    leftBuugengFlipped: settings.leftBuugengFlipped ?? false,
    rightBuugengFlipped: settings.rightBuugengFlipped ?? false,
  };
}

/** Always exactly ten slots; missing entries are empty (null). */
export function presetSlots(
  presets: readonly (PropPreset | null | undefined)[] | undefined
): (PropPreset | null)[] {
  return Array.from(
    { length: PROP_PRESET_SLOT_COUNT },
    (_, index) => presets?.[index] ?? null
  );
}

/**
 * What each hand actually holds. Same-prop mode puts the left prop in both
 * hands, and a flip only means something on the buugeng family, so a stored
 * right prop or flip that the setup ignores never makes two setups differ.
 */
export function heldProps(setup: PropPreset): {
  left: PropType;
  right: PropType;
  leftFlipped: boolean;
  rightFlipped: boolean;
} {
  const left = setup.leftPropType;
  const right = setup.catDogMode ? setup.rightPropType : left;
  return {
    left,
    right,
    leftFlipped: isBuugengFamilyProp(left) && (setup.leftBuugengFlipped ?? false),
    rightFlipped:
      isBuugengFamilyProp(right) && (setup.rightBuugengFlipped ?? false),
  };
}

/** True when both put the same props in each hand. */
export function presetsMatch(a: PropPreset, b: PropPreset): boolean {
  const x = heldProps(a);
  const y = heldProps(b);
  return (
    x.left === y.left &&
    x.right === y.right &&
    x.leftFlipped === y.leftFlipped &&
    x.rightFlipped === y.rightFlipped
  );
}

/** The settings applying a preset writes: every field it stores, plus the slot. */
export function presetSettingsPatch(
  preset: PropPreset,
  index: number
): Pick<
  AppSettings,
  | "selectedPresetIndex"
  | "leftPropType"
  | "rightPropType"
  | "catDogMode"
  | "leftBuugengFlipped"
  | "rightBuugengFlipped"
> {
  return {
    selectedPresetIndex: index,
    leftPropType: preset.leftPropType,
    rightPropType: preset.rightPropType,
    catDogMode: preset.catDogMode,
    leftBuugengFlipped: preset.leftBuugengFlipped ?? false,
    rightBuugengFlipped: preset.rightBuugengFlipped ?? false,
  };
}

/** The key that applies a slot with Alt: 1-9, then 0 for the tenth. */
export function presetShortcutKey(index: number): string {
  return index === PROP_PRESET_SLOT_COUNT - 1 ? "0" : String(index + 1);
}

/** Human label, e.g. "Double Staff" or "Double Staff + Fan". */
export function presetLabel(preset: PropPreset): string {
  const left = getPropTypeDisplayInfo(preset.leftPropType).label;
  if (!preset.catDogMode || preset.rightPropType === preset.leftPropType) {
    return left;
  }
  return `${left} + ${getPropTypeDisplayInfo(preset.rightPropType).label}`;
}
