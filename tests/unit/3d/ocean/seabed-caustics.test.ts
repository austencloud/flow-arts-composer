import { describe, expect, it } from "vitest";
import { MeshStandardMaterial } from "three";
import { patchCausticsMaterial } from "#lib/shared/3d/environments/scenes/ocean/runtime/atmosphere/seabed-caustics.js";

describe("ocean seabed caustics shader", () => {
  it("uses the bounded analytic pattern and skips it when strength is zero", () => {
    const material = new MeshStandardMaterial();
    patchCausticsMaterial(material);

    const shader = {
      uniforms: {},
      vertexShader: "void main() {\n#include <project_vertex>\n}",
      fragmentShader: "#include <common>\n#include <emissivemap_fragment>",
    };
    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.fragmentShader).toContain(
      "fade > 0.001 && uCausticStrength > 0.0001"
    );
    expect(shader.fragmentShader).not.toContain("for (int");
    expect(shader.fragmentShader.match(/sin\(/g)).toHaveLength(4);
  });
});
