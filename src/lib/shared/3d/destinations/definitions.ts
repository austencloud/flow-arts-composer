/**
 * Destination Definitions - Registry of all 3D destinations
 *
 * Central registry consumed by the destination manager. Each destination
 * lives in its own feature folder; the procedural engine at
 * shared/3d/procedural-engine/ is the shared infrastructure they compose on.
 */

import { CameraMode } from "../camera/types";
import type { Destination, DestinationCategory } from "./types";
import { resilientLazyImport } from "#lib/shared/hmr-helper.js";

/**
 * All available 3D destinations
 */
export const DESTINATIONS: Destination[] = [
  // Campground clearing surrounded by procedural forest (was id: "realm")
  {
    id: "campground",
    name: "Campground",
    description: "Campground clearing surrounded by procedural forest terrain",
    icon: "fa-earth-americas",
    color: "#10b981", // Green
    supportsMultiplayer: false,
    supportsPhysics: true,
    defaultCameraMode: CameraMode.FIRST_PERSON,
    category: "exploration",
    tags: ["procedural", "terrain", "campground", "exploration"],
    component: resilientLazyImport(
      () => import("../../../features/campground/CampgroundDestination.svelte")
    ),
    enabled: true,
  },
  {
    id: "museum",
    name: "Museum",
    description: "Curate your own open-air museum of sequences",
    icon: "fa-building-columns",
    color: "#a78bfa",
    supportsMultiplayer: false,
    supportsPhysics: true,
    defaultCameraMode: CameraMode.FIRST_PERSON,
    category: "social",
    tags: ["museum", "gallery", "curation", "exhibits"],
    component: resilientLazyImport(
      () =>
        import("../../../features/museum/scenes/procedural/MuseumDestination.svelte")
    ),
    enabled: true,
  },
  {
    id: "3d-controls",
    name: "3D Controls",
    description:
      "Adjust grid positions, turns, planes, and motion types on a live 3D scene",
    icon: "fa-cube",
    color: "#06b6d4",
    supportsMultiplayer: false,
    supportsPhysics: false,
    defaultCameraMode: CameraMode.ORBIT,
    category: "creative",
    tags: ["controls", "dev", "tuning", "props"],
    component: resilientLazyImport(
      () =>
        import("../../../features/lab/tools/3d-controls/ThreeDControlsLab.svelte")
    ),
    enabled: true,
  },
  // Disabled destinations (kept for future re-enabling)
  {
    id: "flow-fest-sim",
    name: "Flow Fest Sim",
    description: "Meter-true Earth terrain for a fictional flow festival",
    icon: "fa-campground",
    color: "#f97316",
    supportsMultiplayer: false,
    supportsPhysics: true,
    defaultCameraMode: CameraMode.FIRST_PERSON,
    category: "exploration",
    tags: ["real-terrain", "festival", "earth", "ohio"],
    component: resilientLazyImport(
      () =>
        import("../../../features/hannons-camp/HannonsCampDestination.svelte")
    ),
    enabled: false,
  },
  // Future destinations:
  // {
  //   id: "forest",
  //   name: "Mystic Forest",
  //   description: "Nature environment with vegetation and ambient sounds",
  //   icon: "fa-tree",
  //   color: "#22c55e",
  //   ...
  // },
  // {
  //   id: "arena",
  //   name: "Performance Arena",
  //   description: "Large stage for multi-performer shows with audience view",
  //   icon: "fa-landmark-dome",
  //   color: "#f97316",
  //   ...
  // },
];

/**
 * Destination categories
 */
export const DESTINATION_CATEGORIES: DestinationCategory[] = [
  {
    id: "performance",
    name: "Performance",
    description: "Watch and create choreography",
    icon: "fa-theater-masks",
    color: "#8b5cf6",
  },
  {
    id: "social",
    name: "Social",
    description: "Hang out with friends",
    icon: "fa-users",
    color: "#06b6d4",
  },
  {
    id: "exploration",
    name: "Exploration",
    description: "Browse new worlds",
    icon: "fa-compass",
    color: "#10b981",
  },
  {
    id: "creative",
    name: "Creative",
    description: "Build and customize",
    icon: "fa-palette",
    color: "#f59e0b",
  },
];

export function getDestination(id: string): Destination | undefined {
  return DESTINATIONS.find((dest) => dest.id === id);
}

export function getDestinationsByCategory(categoryId: string): Destination[] {
  return DESTINATIONS.filter((dest) => dest.category === categoryId);
}

/**
 * Get all destination IDs
 */
export function getAllDestinationIds(): string[] {
  return DESTINATIONS.map((dest) => dest.id);
}
