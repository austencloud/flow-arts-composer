import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { applyHandPick, litProps } from "./hand-pick";

const staffClub = { left: PropType.STAFF, right: PropType.CLUB };

describe("applyHandPick", () => {
  it("under Both gives both hands the prop and clears the flag", () => {
    expect(applyHandPick(staffClub, "both", PropType.FAN)).toEqual({
      left: PropType.FAN,
      right: PropType.FAN,
      catDogMode: false,
    });
  });

  it("under Left changes the left hand only and the flag follows", () => {
    expect(
      applyHandPick(
        { left: PropType.STAFF, right: PropType.STAFF },
        "left",
        PropType.FAN
      )
    ).toEqual({ left: PropType.FAN, right: PropType.STAFF, catDogMode: true });
  });

  it("under Right changes the right hand only", () => {
    expect(applyHandPick(staffClub, "right", PropType.FAN)).toEqual({
      left: PropType.STAFF,
      right: PropType.FAN,
      catDogMode: true,
    });
  });

  it("turns the flag off when a one-hand pick matches the other hand", () => {
    expect(applyHandPick(staffClub, "right", PropType.STAFF).catDogMode).toBe(
      false
    );
  });
});

describe("litProps", () => {
  it("lights the addressed hand's tile under Left or Right", () => {
    expect(litProps(staffClub, "left")).toEqual([PropType.STAFF]);
    expect(litProps(staffClub, "right")).toEqual([PropType.CLUB]);
  });

  it("lights one tile under Both when the hands match, two when they differ", () => {
    expect(
      litProps({ left: PropType.STAFF, right: PropType.STAFF }, "both")
    ).toEqual([PropType.STAFF]);
    expect(litProps(staffClub, "both")).toEqual([
      PropType.STAFF,
      PropType.CLUB,
    ]);
  });
});
