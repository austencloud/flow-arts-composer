import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { resolveThrelteScene } from "#lib/shared/3d/scene-boot/threlte-handles.js";

describe("shared scene context compatibility", () => {
  it("keeps the installed Threlte direct scene and its children", () => {
    const scene = new Scene();
    const child = new Scene();
    resolveThrelteScene(scene).add(child);
    expect(scene.children).toEqual([child]);
  });

  it("unwraps a current holder without copying the scene", () => {
    const scene = new Scene();
    const holder = { current: scene };
    expect(resolveThrelteScene(holder)).toBe(scene);
    holder.current = new Scene();
    expect(resolveThrelteScene(holder)).toBe(holder.current);
  });
});
