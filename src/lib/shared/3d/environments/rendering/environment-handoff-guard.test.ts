import { describe, expect, it } from "vitest";
import { Color, Fog, Group, Scene } from "three";
import { EnvironmentHandoffGuard } from "./environment-handoff-guard";

function showWorld(scene: Scene) {
  const world = {
    root: new Group(),
    fog: new Fog(0xff00ff),
    background: new Color(0x220044),
  };
  scene.add(world.root);
  scene.fog = world.fog;
  scene.background = world.background;
  return world;
}

describe("environment handoff guard", () => {
  it("holds the shown world's look while the incoming one attaches", () => {
    const scene = new Scene();
    const shown = showWorld(scene);
    const guard = new EnvironmentHandoffGuard();
    guard.begin(scene);

    // The incoming world attaches and claims the scene globals early.
    const incoming = showWorld(scene);
    guard.hold(scene);

    expect(scene.fog).toBe(shown.fog);
    expect(scene.background).toBe(shown.background);
    expect(shown.root.visible).toBe(true);
    expect(incoming.root.visible).toBe(false);
  });

  it("hands the incoming world its own look on promotion", () => {
    const scene = new Scene();
    const shown = showWorld(scene);
    const guard = new EnvironmentHandoffGuard();
    guard.begin(scene);
    const incoming = showWorld(scene);
    guard.hold(scene);

    guard.promote(scene);
    expect(scene.fog).toBe(incoming.fog);
    expect(scene.background).toBe(incoming.background);
    expect(incoming.root.visible).toBe(true);

    // The outgoing world's cleanup restores what it saw at its own mount.
    scene.remove(shown.root);
    scene.fog = null;
    guard.hold(scene);
    expect(scene.fog).toBe(incoming.fog);
  });

  it("starts an incoming world that sets no globals from an empty scene", () => {
    const scene = new Scene();
    showWorld(scene);
    const guard = new EnvironmentHandoffGuard();
    guard.begin(scene);
    const voidRoot = new Group();
    scene.add(voidRoot);
    guard.hold(scene);

    guard.promote(scene);
    expect(scene.fog).toBeNull();
    expect(scene.background).toBeNull();
    expect(voidRoot.visible).toBe(true);
  });

  it("keeps the shown world untouched when the incoming one is dropped", () => {
    const scene = new Scene();
    const shown = showWorld(scene);
    const guard = new EnvironmentHandoffGuard();
    guard.begin(scene);
    const incoming = showWorld(scene);
    guard.hold(scene);

    guard.cancel(scene);
    expect(scene.fog).toBe(shown.fog);
    expect(scene.background).toBe(shown.background);
    expect(guard.preparing).toBe(false);

    // Its own cleanup then runs; nothing of it may stick.
    scene.remove(incoming.root);
    guard.hold(scene);
    expect(scene.fog).toBe(shown.fog);
  });

  it("forgets an abandoned world's globals when the preparation retargets", () => {
    const scene = new Scene();
    showWorld(scene);
    const guard = new EnvironmentHandoffGuard();
    guard.begin(scene);
    showWorld(scene);
    guard.hold(scene);

    guard.begin(scene);
    guard.promote(scene);
    expect(scene.fog).toBeNull();
  });
});
