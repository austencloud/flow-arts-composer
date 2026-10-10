import { describe, it, expect } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { resolvePerformerProp } from "#lib/shared/3d/state/performer-prop-resolution.js";

describe("resolvePerformerProp", () => {
  it("returns the performer's effective prop", () => {
    const performer = { effectiveProp: PropType.FAN } as any;
    expect(resolvePerformerProp(performer, PropType.STAFF)).toBe(PropType.FAN);
  });

  it("returns the global fallback when performer is null", () => {
    expect(resolvePerformerProp(null, PropType.STAFF)).toBe(PropType.STAFF);
  });

  it("keeps a performer's custom prop above the viewer override", () => {
    const performer = {
      settings: { prop: PropType.CHICKEN },
      effectiveProp: PropType.CHICKEN,
    } as any;

    expect(
      resolvePerformerProp(performer, PropType.STAFF, PropType.GUITAR)
    ).toBe(PropType.CHICKEN);
  });

  it("uses the viewer override while the performer inherits", () => {
    const performer = {
      settings: { prop: null },
      effectiveProp: PropType.STAFF,
    } as any;

    expect(
      resolvePerformerProp(performer, PropType.STAFF, PropType.GUITAR)
    ).toBe(PropType.GUITAR);
  });

  it("returns the global fallback when performer is undefined", () => {
    expect(resolvePerformerProp(undefined, PropType.STAFF)).toBe(
      PropType.STAFF
    );
  });
});
