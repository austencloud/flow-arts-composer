import { describe, expect, it } from "vitest";
import { buildTnDCardDisplay, tndSelectionElement } from "../tnd-card-display";

describe("tndSelectionElement", () => {
  it("maps a mode to its element and Free to null", () => {
    expect(tndSelectionElement("TS")?.element).toBe("earth");
    expect(tndSelectionElement("QO")?.element).toBe("moon");
    expect(tndSelectionElement("free")).toBeNull();
  });
});

describe("buildTnDCardDisplay", () => {
  it("is neutral and inactive when both are free", () => {
    const display = buildTnDCardDisplay({
      handRelationship: "free",
      propRelationship: "free",
      matchHandTurns: false,
      blockedHandModes: {},
    });

    expect(display.hands).toEqual({
      label: "Hands",
      value: "Free",
      element: null,
    });
    expect(display.props).toEqual({
      label: "Props",
      value: "Free",
      element: null,
    });
    expect(display.active).toBe(false);
    expect(display.accent).toBeNull();
    expect(display.ariaLabel).toBe(
      "Timing and direction: hands Free, props Free. Click to configure."
    );
  });

  it("takes the accent from the hand element first", () => {
    const display = buildTnDCardDisplay({
      handRelationship: "TO",
      propRelationship: "SS",
      matchHandTurns: false,
      blockedHandModes: {},
    });

    expect(display.hands.value).toBe("Together Opposite");
    expect(display.hands.element?.element).toBe("air");
    expect(display.props.value).toBe("Split Same");
    expect(display.props.element?.element).toBe("water");
    expect(display.accent).toBe(display.hands.element?.accentColor);
    expect(display.darkComplement).toBe(display.hands.element?.darkComplement);
    expect(display.active).toBe(true);
  });

  it("falls back to the prop element when hands are free", () => {
    const display = buildTnDCardDisplay({
      handRelationship: "free",
      propRelationship: "QS",
      matchHandTurns: false,
      blockedHandModes: {},
    });

    expect(display.accent).toBe(display.props.element?.accentColor);
    expect(display.active).toBe(true);
  });

  it("marks a hand mode the LOOP has switched off", () => {
    const display = buildTnDCardDisplay({
      handRelationship: "QS",
      propRelationship: "free",
      matchHandTurns: false,
      blockedHandModes: { QS: "Not compatible with a Reflection LOOP" },
    });

    expect(display.handBlocked).toBe(true);
    expect(display.hands.value).toBe("Quarter Same, off with LOOP");
    expect(display.hands.element).toBeNull();
    expect(display.accent).toBeNull();
    expect(display.active).toBe(false);
  });

  it("speaks matched turns", () => {
    const display = buildTnDCardDisplay({
      handRelationship: "TS",
      propRelationship: "free",
      matchHandTurns: true,
      blockedHandModes: {},
    });

    expect(display.ariaLabel).toBe(
      "Timing and direction: hands Together Same, props Free, turns matched. Click to configure."
    );
  });
});
