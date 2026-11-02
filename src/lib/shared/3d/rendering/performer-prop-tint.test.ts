import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from "three";
import {
  derivePropHandPalette,
  propHandPalette,
} from "@austencloud/scene-3d/prop-hand-palette";
import { createPerformerPropTint } from "./performer-prop-tint";

function hex(material: Material | Material[]): string {
  return `#${(material as MeshStandardMaterial).color.getHexString()}`;
}

/** A performer as PerformerRig mounts it: shared hand materials per prop group. */
function performer(shared: {
  blue: MeshStandardMaterial;
  red: MeshStandardMaterial;
  metal: MeshStandardMaterial;
}) {
  const root = new Group();
  const left = new Group();
  left.name = "PERFORMER_PROP_LEFT";
  const right = new Group();
  right.name = "PERFORMER_PROP_RIGHT";
  const geometry = new BoxGeometry();
  const leftBody = new Mesh(geometry, shared.blue);
  const leftCap = new Mesh(geometry, shared.metal);
  const rightBody = new Mesh(geometry, shared.red);
  left.add(leftBody, leftCap);
  right.add(rightBody);
  root.add(left, right);
  return { root, leftBody, leftCap, rightBody };
}

function sharedMaterials() {
  return {
    blue: new MeshStandardMaterial({ color: propHandPalette("blue").main }),
    red: new MeshStandardMaterial({ color: propHandPalette("red").dark }),
    metal: new MeshStandardMaterial({ color: "#888888" }),
  };
}

describe("performer prop tint", () => {
  it("paints one performer's props without repainting the shared materials", () => {
    const shared = sharedMaterials();
    const front = performer(shared);
    const back = performer(shared);
    const tint = createPerformerPropTint();

    tint.apply(back.root, { left: "#22c55e", right: "#eab308" });

    expect(hex(back.leftBody.material)).toBe("#22c55e");
    // Each paint keeps its role: a dark part stays the dark of the new pair.
    expect(hex(back.rightBody.material)).toBe(
      derivePropHandPalette("#eab308").dark
    );
    // Unpainted parts and the other performer keep the shared materials.
    expect(back.leftCap.material).toBe(shared.metal);
    expect(front.leftBody.material).toBe(shared.blue);
    expect(hex(shared.blue)).toBe(propHandPalette("blue").main);
  });

  it("reuses its clone frame to frame and restores the shared paint", () => {
    const shared = sharedMaterials();
    const back = performer(shared);
    const tint = createPerformerPropTint();
    const colors = { left: "#22c55e", right: "#eab308" };

    tint.apply(back.root, colors);
    const clone = back.leftBody.material;
    tint.apply(back.root, colors);
    expect(back.leftBody.material).toBe(clone);

    tint.apply(back.root, null);
    expect(back.leftBody.material).toBe(shared.blue);
    expect(back.rightBody.material).toBe(shared.red);
  });

  it("follows a new color pair", () => {
    const shared = sharedMaterials();
    const back = performer(shared);
    const tint = createPerformerPropTint();
    tint.apply(back.root, { left: "#22c55e", right: "#eab308" });
    tint.apply(back.root, { left: "#a855f7", right: "#eab308" });
    expect(hex(back.leftBody.material)).toBe("#a855f7");
    expect(new Color(hex(back.leftBody.material)).getHex()).not.toBe(
      shared.blue.color.getHex()
    );
    tint.dispose();
    expect(back.leftBody.material).toBe(shared.blue);
  });
});
