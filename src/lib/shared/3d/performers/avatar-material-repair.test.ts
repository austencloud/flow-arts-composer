import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { repairFadeLeftoverMaterials } from "./avatar-material-repair";

function meshWith(options: { opacity: number; transparent: boolean; depthWrite: boolean }): Mesh {
  const material = new MeshStandardMaterial(options);
  return new Mesh(new BoxGeometry(), material);
}

describe("repairFadeLeftoverMaterials", () => {
  it("restores only opaque materials stuck in the fade state", () => {
    const root = new Group();
    const leftover = meshWith({ opacity: 1, transparent: true, depthWrite: false });
    const fading = meshWith({ opacity: 0.5, transparent: true, depthWrite: false });
    const hiddenCard = meshWith({ opacity: 0, transparent: true, depthWrite: false });
    const authoredBlend = meshWith({ opacity: 1, transparent: true, depthWrite: true });
    root.add(leftover, fading, hiddenCard, authoredBlend);

    expect(repairFadeLeftoverMaterials(root)).toBe(1);
    const fixed = leftover.material as MeshStandardMaterial;
    expect(fixed.transparent).toBe(false);
    expect(fixed.depthWrite).toBe(true);
    expect((fading.material as MeshStandardMaterial).depthWrite).toBe(false);
    expect((hiddenCard.material as MeshStandardMaterial).transparent).toBe(true);
    expect((authoredBlend.material as MeshStandardMaterial).transparent).toBe(true);
  });
});
