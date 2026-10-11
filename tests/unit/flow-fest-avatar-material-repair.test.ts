import { describe, expect, it } from "vitest";
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from "three";
import {
  isFadeLeftoverMaterial,
  repairFadeLeftoverMaterials,
  sweepFlowFestAvatarMaterials,
} from "#lib/features/flow-fest-sim/services/flow-fest-avatar-material-repair.js";

function material(overrides: Partial<MeshStandardMaterial>) {
  return Object.assign(new MeshStandardMaterial(), overrides);
}

describe("flow-fest avatar material repair", () => {
  it("recognises only the opaque-but-fading signature", () => {
    expect(
      isFadeLeftoverMaterial(
        material({ opacity: 1, transparent: true, depthWrite: false })
      )
    ).toBe(true);
    // Still fading.
    expect(
      isFadeLeftoverMaterial(
        material({ opacity: 0.4, transparent: true, depthWrite: false })
      )
    ).toBe(false);
    // Hidden hair / eyelash cards.
    expect(
      isFadeLeftoverMaterial(
        material({ opacity: 0, transparent: true, depthWrite: false })
      )
    ).toBe(false);
    // Authored alpha-blended material straight from GLTFLoader.
    expect(
      isFadeLeftoverMaterial(
        material({ opacity: 1, transparent: true, depthWrite: true })
      )
    ).toBe(false);
    expect(isFadeLeftoverMaterial(material({}))).toBe(false);
  });

  it("restores leftovers under performer roots and leaves the rest alone", () => {
    const scene = new Group();
    const performer = new Group();
    performer.name = "PERFORMER_flow-fest-player";
    const pants = new Mesh(
      new BoxGeometry(),
      material({ opacity: 1, transparent: true, depthWrite: false })
    );
    const hair = new Mesh(
      new BoxGeometry(),
      material({ opacity: 0, transparent: true, depthWrite: false })
    );
    performer.add(pants, hair);

    const prop = new Group();
    prop.name = "FFS_Lantern";
    const glass = new Mesh(
      new BoxGeometry(),
      material({ opacity: 1, transparent: true, depthWrite: false })
    );
    prop.add(glass);
    scene.add(performer, prop);

    expect(sweepFlowFestAvatarMaterials(scene)).toBe(1);
    expect(pants.material).toMatchObject({ transparent: false, depthWrite: true });
    expect(hair.material).toMatchObject({ opacity: 0, transparent: true });
    expect(glass.material).toMatchObject({ transparent: true, depthWrite: false });
    expect(repairFadeLeftoverMaterials(performer)).toBe(0);
  });
});
