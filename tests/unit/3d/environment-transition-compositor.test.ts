import { describe, expect, it, vi } from "vitest";
import {
  Color,
  Fog,
  Group,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
} from "three";

import {
  BASE_SCENE_LAYER,
  EnvironmentTransitionCompositor,
  PROTECTED_PERFORMER_LAYER,
  protectPerformerTree,
} from "$lib/shared/3d/environments/rendering/environment-transition-compositor";

describe("environment transition compositor", () => {
  it("holds the complete outgoing frame through interrupted loads and releases it after reveal", () => {
    const compositor = new EnvironmentTransitionCompositor();
    const opacities: number[] = [];
    const renderer = {
      autoClear: true,
      outputColorSpace: SRGBColorSpace,
      getDrawingBufferSize: vi.fn((size: Vector2) => size.set(1280, 720)),
      copyFramebufferToTexture: vi.fn(),
      clearDepth: vi.fn(),
      render: vi.fn((scene: Scene) => {
        const material = (scene.children[0] as import("three").Mesh)
          .material as import("three").MeshBasicMaterial;
        opacities.push(material.opacity);
        expect(material.map?.image).toMatchObject({ width: 1280, height: 720 });
      }),
    } as unknown as import("three").WebGLRenderer;
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    compositor.capture(renderer);
    const texture = vi.mocked(renderer.copyFramebufferToTexture).mock
      .calls[0][0];
    const dispose = vi.spyOn(texture, "dispose");
    compositor.render(renderer, scene, camera, 0, "covering");
    compositor.render(renderer, scene, camera, 0.88, "gap");
    compositor.render(renderer, scene, camera, 0.88, "waiting");
    compositor.capture(renderer);
    compositor.render(renderer, scene, camera, 0.88, "covering");
    compositor.render(renderer, scene, camera, 0.44, "revealing");

    expect(opacities).toEqual([1, 1, 1, 1, 0.5]);
    expect(renderer.copyFramebufferToTexture).toHaveBeenCalledTimes(1);
    expect(renderer.clearDepth).not.toHaveBeenCalled();
    expect(renderer.autoClear).toBe(true);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(dispose).not.toHaveBeenCalled();
    compositor.render(renderer, scene, camera, 0, "idle");
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(compositor.hasRetainedFrame).toBe(false);
    compositor.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("adds declarative and imperative performer descendants to both passes", () => {
    const root = new Group();
    const declarativeChild = new Group();
    const imperativeEffect = new Group();
    declarativeChild.add(imperativeEffect);
    root.add(declarativeChild);

    protectPerformerTree(root);

    for (const object of [root, declarativeChild, imperativeEffect]) {
      expect(object.layers.isEnabled(BASE_SCENE_LAYER)).toBe(true);
      expect(object.layers.isEnabled(PROTECTED_PERFORMER_LAYER)).toBe(true);
    }
  });

  it("draws veil then performer and restores shared renderer state", () => {
    const compositor = new EnvironmentTransitionCompositor();
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const background = new Color(0x123456);
    const fog = new Fog(0x654321, 1, 20);
    scene.background = background;
    scene.fog = fog;
    camera.layers.enable(3);

    const calls: string[] = [];
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(() => calls.push("clearDepth")),
      render: vi.fn((renderedScene: Scene) => {
        calls.push(renderedScene === scene ? "performer" : "veil");
        if (renderedScene === scene) {
          expect(scene.background).toBeNull();
          expect(scene.fog).toBeNull();
          expect(camera.layers.isEnabled(PROTECTED_PERFORMER_LAYER)).toBe(true);
          expect(camera.layers.isEnabled(BASE_SCENE_LAYER)).toBe(false);
        }
      }),
    } as unknown as import("three").WebGLRenderer;

    const originalMask = camera.layers.mask;
    compositor.render(renderer, scene, camera, 0.88);

    expect(calls).toEqual(["veil", "clearDepth", "performer"]);
    expect(renderer.autoClear).toBe(true);
    expect(camera.layers.mask).toBe(originalMask);
    expect(scene.background).toBe(background);
    expect(scene.fog).toBe(fog);
    compositor.dispose();
  });

  it("does no extra rendering when the transition is invisible", () => {
    const compositor = new EnvironmentTransitionCompositor();
    const renderer = {
      autoClear: true,
      clearDepth: vi.fn(),
      render: vi.fn(),
    } as unknown as import("three").WebGLRenderer;

    compositor.render(renderer, new Scene(), new PerspectiveCamera(), 0);

    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.clearDepth).not.toHaveBeenCalled();
    compositor.dispose();
  });
});
