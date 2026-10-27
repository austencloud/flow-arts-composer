import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
} from "three";
import {
  clothingPart,
  clothingTint,
  tintClothing,
  TINT_VALUE,
} from "./clothing-tint";

/** A character as the roster GLBs are cut: one material per mesh, after the package's per-performer clone. */
function character(names: string[]): Group {
  const root = new Group();
  for (const name of names) {
    const mesh = new SkinnedMesh(
      new BufferGeometry(),
      new MeshStandardMaterial({ color: 0xcccccc })
    );
    mesh.name = name;
    root.add(mesh);
  }
  return root;
}

function colourOf(root: Group, name: string): number {
  return (
    (root.getObjectByName(name) as Mesh).material as MeshStandardMaterial
  ).color.getHex();
}

describe("clothing tint", () => {
  it("finds the garments in the roster's mesh names, not the body, hair or shoes", () => {
    expect(clothingPart("Ch01_Shirt")).toBe("shirt");
    expect(clothingPart("Ch07_Suit")).toBe("suit");
    expect(clothingPart("Ch41_Coat")).toBe("coat");
    expect(clothingPart("Ch42_Shorts")).toBe("shorts");
    // GLTFLoader makes repeated names unique with a suffix.
    expect(clothingPart("Ch22_Pants_1")).toBe("pants");
    for (const name of [
      "Ch01_Body",
      "Ch42_Body1",
      "Ch21_Eyelasshes",
      "Ch07_Hair",
      "Ch01_Sneakers",
      "Ch07_Heels",
      "Ch41_Shoe",
      "Ch12",
    ]) {
      expect(clothingPart(name)).toBeNull();
    }
  });

  it("is the same for the same person and garment, and differs between people", () => {
    expect(clothingTint("villager-3", "shirt").getHex()).toBe(
      clothingTint("villager-3", "shirt").getHex()
    );
    const shirts = new Set(
      Array.from({ length: 12 }, (_, i) =>
        clothingTint(`villager-${i}`, "shirt").getHex()
      )
    );
    expect(shirts.size).toBe(12);
    expect(clothingTint("villager-3", "shirt").getHex()).not.toBe(
      clothingTint("villager-3", "pants").getHex()
    );
  });

  it("stays a gentle shift: no channel past the lightest shade or below a dim cloth", () => {
    for (let i = 0; i < 200; i++) {
      const tint = clothingTint(`v${i}`, "shirt");
      for (const channel of [tint.r, tint.g, tint.b]) {
        expect(channel).toBeLessThanOrEqual(TINT_VALUE.max + 1e-9);
        expect(channel).toBeGreaterThan(0.4);
      }
    }
  });

  it("tints only the garments, once, and leaves another person's copy alone", () => {
    const names = [
      "Ch01_Body",
      "Ch01_Shirt",
      "Ch01_Sneakers",
      "Ch01_Pants",
      "Ch01_Eyelashes",
    ];
    const a = character(names);
    const b = character(names);
    expect(tintClothing(a, "villager-1")).toEqual({ skinned: 5, garments: 2 });
    const shirt = colourOf(a, "Ch01_Shirt");
    expect(shirt).not.toBe(0xcccccc);
    expect(colourOf(a, "Ch01_Pants")).not.toBe(0xcccccc);
    expect(colourOf(a, "Ch01_Body")).toBe(0xcccccc);
    expect(colourOf(a, "Ch01_Sneakers")).toBe(0xcccccc);
    expect(colourOf(b, "Ch01_Shirt")).toBe(0xcccccc);
    // A second pass does not darken it again.
    expect(tintClothing(a, "villager-1").garments).toBe(0);
    expect(colourOf(a, "Ch01_Shirt")).toBe(shirt);
  });

  it("finds no garments on a one-mesh character, and nothing on props", () => {
    expect(tintClothing(character(["Ch12"]), "v")).toEqual({
      skinned: 1,
      garments: 0,
    });
    const prop = new Group();
    const staff = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
    staff.name = "staff_coat_wrap";
    prop.add(staff);
    expect(tintClothing(prop, "v")).toEqual({ skinned: 0, garments: 0 });
  });
});
