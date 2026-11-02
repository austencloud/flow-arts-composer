// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadScene3DState } from "./scene3d-persister";

beforeEach(() => localStorage.clear());

describe("legacy 3D animator state", () => {
  it("restores literal blue/red visibility, config, and sequence motions", () => {
    localStorage.setItem(
      "tka-3d-animator-state",
      JSON.stringify({
        activeTab: "blue",
        showBlue: false,
        showRed: true,
        blueConfig: { motionType: "pro" },
        redConfig: { motionType: "anti" },
        loadedSequence: {
          steps: [
            {
              motions: {
                blue: { color: "blue" },
                red: { color: "red" },
              },
            },
          ],
        },
      })
    );

    const restored = loadScene3DState();
    expect(restored).toMatchObject({
      activeTab: "left",
      showLeft: false,
      showRight: true,
      leftConfig: { motionType: "pro" },
      rightConfig: { motionType: "anti" },
    });
    expect(restored.loadedSequence?.steps[0]?.motions).toMatchObject({
      left: { hand: "left" },
      right: { hand: "right" },
    });
  });
});
