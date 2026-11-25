/**
 * Everything the site is dressed in that has to arrive: the photographed surfaces
 * and the real parked cars.
 *
 * All of it is fetched while the curtain is up. Whatever has not come by the time
 * limit is left out, and the site shows its own drawn surface or drawn car in that
 * place, so a slow or missing file costs detail and never the walk.
 */

import {
  ImageBitmapLoader,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  type Group,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { attachGltfDecoders } from "#lib/shared/3d/scene-boot/gltf-decoders.js";
import { disposeSceneGraph } from "#lib/shared/3d/environments/utils/dispose-scene.js";
import {
  createFlowFestParkedCarInstances,
  disposeFlowFestParkedCarInstances,
} from "../../flow-fest-sim/flow-fest-parked-cars";
import type { CarShape, SiteSurroundings } from "../site-walk-around";
import type { SiteWalkWorld } from "../site-walk-plan";
import { parkCars, type ParkedFleet } from "./site-walk-car-list";
import {
  SCANS,
  neededScans,
  scanFiles,
  type ScanName,
} from "./site-walk-scan-list";

export interface Scan {
  name: ScanName;
  /** Null for a weave, which has relief and no colour of its own. */
  albedo: Texture | null;
  normal: Texture;
  /** Metres the photograph covers. */
  wide: number;
  high: number;
}

export interface Dressing {
  scans: ReadonlyMap<ScanName, Scan>;
  /** The real bodies, parked; empty when none came. */
  cars: Group[];
  /** The surroundings with only the cars that no real body arrived for. */
  around: SiteSurroundings | null;
  dispose(): void;
}

/** Long enough for a phone on a fair connection; past it the drawn site is good enough to walk. */
const LIMIT_MS = 15000;

async function picture(
  url: string,
  colour: boolean,
  anisotropy: number,
  signal: AbortSignal
): Promise<Texture> {
  const loader = new ImageBitmapLoader().setOptions({
    imageOrientation: "flipY",
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const bitmap = await loader.loadAsync(url);
  if (signal.aborted) {
    bitmap.close();
    throw new DOMException("Too late", "AbortError");
  }
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = colour ? SRGBColorSpace : LinearSRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

function drop(texture: Texture | null): void {
  if (!texture) return;
  texture.dispose();
  (texture.image as ImageBitmap | undefined)?.close?.();
}

export async function loadDressing(
  renderer: WebGLRenderer,
  world: SiteWalkWorld,
  around: SiteSurroundings | null,
  phone: boolean
): Promise<Dressing> {
  const late = new AbortController();
  const anisotropy = Math.min(
    phone ? 4 : 16,
    renderer.capabilities.getMaxAnisotropy()
  );
  const scans = new Map<ScanName, Scan>();
  const arrived: { fleet: ParkedFleet; body: Object3D }[] = [];

  const scan = async (name: ScanName) => {
    const files = scanFiles(name, phone);
    const [albedo, normal] = await Promise.allSettled([
      files.albedo
        ? picture(files.albedo, true, anisotropy, late.signal)
        : Promise.resolve(null),
      picture(files.normal, false, anisotropy, late.signal),
    ]);
    if (
      albedo.status === "fulfilled" &&
      normal.status === "fulfilled" &&
      !late.signal.aborted
    ) {
      scans.set(name, {
        name,
        albedo: albedo.value,
        normal: normal.value,
        wide: SCANS[name].wide,
        high: SCANS[name].high,
      });
      return;
    }
    if (albedo.status === "fulfilled") drop(albedo.value);
    if (normal.status === "fulfilled") drop(normal.value);
  };

  const fleets = parkCars(around?.cars ?? [], phone);
  const gltf = new GLTFLoader();
  if (fleets.length) attachGltfDecoders(gltf);
  const car = async (fleet: ParkedFleet) => {
    const { scene } = await gltf.loadAsync(fleet.model.url);
    if (late.signal.aborted) disposeSceneGraph(scene);
    else arrived.push({ fleet, body: scene });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([
      ...neededScans(
        { canopies: world.canopies.length, streets: world.streets.length },
        around
      ).map(scan),
      ...fleets.map(car),
    ]),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, LIMIT_MS))),
  ]);
  clearTimeout(timer);
  late.abort();

  const cars = arrived.map(({ fleet, body }) =>
    createFlowFestParkedCarInstances(body, fleet.model, fleet.placements)
  );
  for (const root of cars) {
    root.traverse((o) => {
      // The site has its own solid boxes for cars; the camera stops at those.
      o.userData.cameraCollider = false;
    });
  }
  const parked = new Set(
    arrived.flatMap(({ fleet }) => fleet.placements.map((p) => `${p.x},${p.z}`))
  );
  const drawn = (car: CarShape) => !parked.has(`${car.at.x},${car.at.z}`);

  return {
    scans,
    cars,
    around: around && { ...around, cars: around.cars.filter(drawn) },
    dispose() {
      for (const s of scans.values()) {
        drop(s.albedo);
        drop(s.normal);
      }
      for (const root of cars) {
        root.traverse((o) => {
          const material = (o as Mesh).material as
            | Material
            | Material[]
            | undefined;
          for (const m of Array.isArray(material) ? material : [material])
            m?.dispose();
        });
        disposeFlowFestParkedCarInstances(root);
      }
      for (const { body } of arrived) disposeSceneGraph(body);
    },
  };
}
