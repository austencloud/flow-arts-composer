import { afterEach, describe, expect, it } from "vitest";
import { persistence } from "../../../apps/shape-engine/src/persistence";
import { readShapeMatrixRouteState } from "../../../src/routes/(public)/shape-engine/_state/shape-matrix-url";

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("installed Shape Engine view persistence", () => {
  it("restores a ratio playground selection after the app closes", () => {
    const state = readShapeMatrixRouteState("theory=1&leftRatio=3:2&rightRatio=5:4&mode=QO");
    persistence.persist(state);
    expect(persistence.restore()).toEqual(state);
  });

  it("shares a public web address instead of the device's localhost address", () => {
    const state = readShapeMatrixRouteState("level=3&blueTurn=0.5&redTurn=1.5&mode=SS");
    const url = new URL(persistence.link!(state));
    expect(url.origin).toBe("https://tkaflowarts.com");
    expect(url.pathname).toBe("/shape-engine");
    expect(readShapeMatrixRouteState(url.search)).toEqual(state);
  });

  it("gives an incoming shared view precedence over the last saved view", () => {
    persistence.persist(readShapeMatrixRouteState("level=2&mode=SS"));
    window.history.replaceState(null, "", "/?level=4&mode=TO");
    expect(persistence.restore()).toEqual(readShapeMatrixRouteState("level=4&mode=TO"));
  });
});
