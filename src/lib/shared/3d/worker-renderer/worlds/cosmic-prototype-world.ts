import { BackgroundType } from "@austencloud/backgrounds";
import { Scene } from "three";
import {
  getAddedPerformerStageGrowth,
  getCanonicalPerformerStageBounds,
  getPerformerStageBounds,
} from "../../environments/domain/performer-stage-bounds";
import { getStageCoordinateFrame } from "../../environments/domain/stage-coordinate-frame";
import { createCosmicEnvironmentWorld } from "../../environments/worlds/cosmic/cosmic-environment-world";
import type {
  WorkerEnvironmentWorld,
  WorkerWorldContext,
} from "./worker-environment-world";

export type CosmicPrototypeWorld = Omit<
  WorkerEnvironmentWorld,
  "environment"
> & { environment: "cosmic" };

/** Worker lifecycle adapter around the exact production Cosmic world owner. */
export async function createCosmicPrototypeWorld(
  context: WorkerWorldContext
): Promise<CosmicPrototypeWorld> {
  context.reportProgress("construct", 0.02);
  // Performers stand on the canonical deck height above their groundY. The
  // Moon moves up by the same frame offset the other worlds use, so the pad
  // meets their soles instead of lying half a metre below them.
  const { environmentYOffset } = getStageCoordinateFrame(BackgroundType.COSMIC, true);
  const moonGroundY = (performers: WorkerWorldContext["performers"]) =>
    (performers[0]?.groundY ?? -1.5) + environmentYOffset;
  const scene = new Scene();
  const environment = await createCosmicEnvironmentWorld({
    renderer: context.renderer,
    groundY: moonGroundY(context.performers),
    stageRadius: 3,
    motionScale: context.reducedMotion ? 0 : 1,
    onAssetProgress: (fraction) => context.reportProgress("assets", fraction),
    // The seated audience sits outside the opening framing and costs six
    // character models. It starts loading once the scene is on screen, so it
    // never competes with the reveal, and is compiled and uploaded against the
    // live scene before it joins, so it arrives without a hitch.
    audienceGate: context.scenePresented,
    prepareAudience: (audience) =>
      context.prepareLateObject?.(audience, scene) ?? Promise.resolve(),
  });
  // The landing pad grows with the cast, the way the other stages do.
  function setPerformers(performers: WorkerWorldContext["performers"]): void {
    const bounds = getPerformerStageBounds(
      performers.map(({ position }) => ({ x: position[0], z: position[2] }))
    );
    const canonical = getCanonicalPerformerStageBounds(performers.length);
    environment.setGroundY(moonGroundY(performers));
    environment.setStageBounds(
      Math.max(bounds.radius, canonical.radius),
      getAddedPerformerStageGrowth(performers.length)
    );
  }
  setPerformers(context.performers);
  scene.add(environment.root);
  scene.fog = environment.fog;
  void environment.audienceReady.catch(() => undefined);
  context.reportProgress("construct", 1);

  return {
    environment: "cosmic",
    scene,
    useViewerBaseLighting: false,
    update(deltaSeconds, elapsedSeconds) {
      environment.update(deltaSeconds, elapsedSeconds, context.camera);
    },
    setPerformers,
    dispose() {
      scene.remove(environment.root);
      if (scene.fog === environment.fog) scene.fog = null;
      environment.dispose();
      scene.clear();
    },
  };
}
