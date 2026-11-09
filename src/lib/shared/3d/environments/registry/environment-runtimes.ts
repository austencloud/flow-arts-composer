import type { Component } from "svelte";
import type { EnvironmentDef } from "./environment-manifest";

/** What `Environment3D` hands every registered scene. */
export interface RegisteredEnvironmentProps {
  environment: EnvironmentDef;
  /** Retained film worlds load while hidden but only the active one owns globals. */
  active?: boolean;
  performerCount?: number;
  stageWidth?: number;
  stageDepth?: number;
  stageZOffset?: number;
  /** Translation applied by the shared environment coordinate frame. */
  worldYOffset?: number;
}

export type RegisteredEnvironmentModule = {
  default: Component<RegisteredEnvironmentProps>;
};

/**
 * Scene-owned runtimes, named by a manifest's `runtime` field. Only scenes with
 * genuinely dynamic systems (water, creatures, instanced reef) need one; each
 * stays a separate dynamic import so a viewer downloads only the scene it opens.
 */
const RUNTIMES: Readonly<
  Record<string, () => Promise<RegisteredEnvironmentModule>>
> = {
  ocean: () => import("../scenes/ocean/OceanScene.svelte"),
};

export function hasEnvironmentRuntime(name: string): boolean {
  return Object.hasOwn(RUNTIMES, name);
}

export function environmentModuleImporter(
  environment: EnvironmentDef
): () => Promise<RegisteredEnvironmentModule> {
  if (environment.runtime === null) {
    return () => import("../components/GlbEnvironment.svelte");
  }
  const runtime = RUNTIMES[environment.runtime];
  if (!runtime) {
    throw new Error(
      `scene.json "${environment.id}" names unknown runtime "${environment.runtime}"`
    );
  }
  return runtime;
}
