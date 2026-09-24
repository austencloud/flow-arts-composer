import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  DEFAULT_PROP_PRESETS,
  PROP_PRESET_SLOT_COUNT,
  defaultPropPresets,
  presetFromSettings,
  presetLabel,
  presetSettingsPatch,
  presetShortcutKey,
  presetSlots,
  presetsMatch,
} from "./prop-presets";

describe("prop presets", () => {
  it("fills every slot by default, ending with a mixed pair", () => {
    expect(DEFAULT_PROP_PRESETS).toHaveLength(PROP_PRESET_SLOT_COUNT);
    expect(DEFAULT_PROP_PRESETS.at(-1)).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("hands out copies that cannot corrupt the defaults", () => {
    const copy = defaultPropPresets();
    copy[0]!.leftPropType = PropType.CLUB;
    expect(DEFAULT_PROP_PRESETS[0]!.leftPropType).toBe(PropType.STAFF);
  });

  it("pads and trims stored presets to exactly ten slots", () => {
    const short = presetSlots([DEFAULT_PROP_PRESETS[1]!]);
    expect(short).toHaveLength(10);
    expect(short[0]?.leftPropType).toBe(PropType.FAN);
    expect(short.slice(1).every((slot) => slot === null)).toBe(true);
    expect(presetSlots(undefined)).toEqual(Array(10).fill(null));
  });

  it("reads the current setup, falling back to the legacy single prop type", () => {
    expect(
      presetFromSettings({ propType: PropType.CLUB, catDogMode: false })
    ).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      catDogMode: false,
      leftBuugengFlipped: false,
      rightBuugengFlipped: false,
    });
  });

  it("treats a missing flip as unflipped but a real flip as a different setup", () => {
    const stored = { leftPropType: PropType.BUUGENG, rightPropType: PropType.BUUGENG, catDogMode: false };
    const current = presetFromSettings({ leftPropType: PropType.BUUGENG, rightPropType: PropType.BUUGENG });
    expect(presetsMatch(stored, current)).toBe(true);
    expect(presetsMatch(stored, { ...current, rightBuugengFlipped: true })).toBe(false);
  });

  it("matches on what each hand holds, not on how the picker is split", () => {
    const staff = DEFAULT_PROP_PRESETS[0]!;
    const catDogStaff = presetFromSettings({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
    expect(presetsMatch(staff, catDogStaff)).toBe(true);
    expect(presetsMatch(staff, { ...catDogStaff, rightPropType: PropType.FAN })).toBe(false);
  });

  it("ignores a leftover flip on a prop that cannot be mirrored", () => {
    const staff = DEFAULT_PROP_PRESETS[0]!;
    expect(presetsMatch(staff, { ...staff, rightBuugengFlipped: true })).toBe(true);
  });

  it("applies flips too, so a shortcut and a click restore the same setup", () => {
    const flipped = {
      leftPropType: PropType.BUUGENG,
      rightPropType: PropType.BUUGENG,
      catDogMode: false,
      rightBuugengFlipped: true,
    };
    expect(presetSettingsPatch(flipped, 3)).toEqual({
      selectedPresetIndex: 3,
      leftPropType: PropType.BUUGENG,
      rightPropType: PropType.BUUGENG,
      catDogMode: false,
      leftBuugengFlipped: false,
      rightBuugengFlipped: true,
    });
  });

  it("maps slots to Alt keys 1-9 and 0", () => {
    expect(Array.from({ length: 10 }, (_, i) => presetShortcutKey(i))).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
    ]);
  });

  it("names a pair once when both hands match", () => {
    expect(presetLabel(DEFAULT_PROP_PRESETS[0]!)).toBe(
      presetLabel({ ...DEFAULT_PROP_PRESETS[0]!, catDogMode: true })
    );
    expect(presetLabel(DEFAULT_PROP_PRESETS[9]!)).toContain(" + ");
  });
});
