import { describe, expect, it } from "vitest";
import {
  Bone,
  BufferGeometry,
  MeshStandardMaterial,
  ShaderLib,
  Skeleton,
  SkinnedMesh,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { hideOwnHead } from "./hide-own-head";

function body() {
  const names = ["Hips", "Spine", "Neck", "Head", "HeadTop_End"];
  const bones = names.map((name) =>
    Object.assign(new Bone(), { name: `mixamorig${name}` })
  );
  bones.reduce((parent, bone) => (parent.add(bone), bone));
  const own = new MeshStandardMaterial();
  const mesh = new SkinnedMesh(new BufferGeometry(), own);
  mesh.add(bones[0]!);
  mesh.bind(new Skeleton(bones));
  return { mesh, own };
}

function compile(mesh: SkinnedMesh) {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: "",
  } as unknown as WebGLProgramParametersWithUniforms;
  (mesh.material as MeshStandardMaterial).onBeforeCompile(
    shader,
    undefined as never
  );
  return shader as unknown as {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
  };
}

describe("hideOwnHead", () => {
  it("folds the head and everything on it away, after the skinning", () => {
    const { mesh } = body();
    hideOwnHead(mesh);
    const shader = compile(mesh);
    // Both hooks must still be in three's shader, or the head silently stays in front of the eye.
    expect(shader.vertexShader).toContain("uniform float uHideHead;");
    expect(shader.vertexShader.indexOf("transformed = uFold")).toBeGreaterThan(
      shader.vertexShader.indexOf("#include <skinning_vertex>")
    );
    expect((shader.uniforms.uHeadBones?.value as number[]).slice(0, 3)).toEqual(
      [3, 4, -1]
    );
  });

  it("leaves the body's own material alone and puts it back on undo", () => {
    const { mesh, own } = body();
    const undo = hideOwnHead(mesh);
    expect(mesh.material).not.toBe(own);
    expect(own.onBeforeCompile.toString()).not.toContain("uHideHead");
    undo();
    expect(mesh.material).toBe(own);
  });
});
