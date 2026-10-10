import { BackgroundType } from "@austencloud/backgrounds";
import type { SceneId } from "#lib/features/lab/tabs/scene-lab/domain/scene-lab-types.js";
// Reading BackgroundType.PRIDE directly leaves this theme with an undefined
// background on any bundle that still calls the environment Rainbow.
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

export type ThemeId =
  | "ocean"
  | "cosmic"
  | "forest"
  | "blossom"
  | "rainbow"
  | "ember"
  | "winter"
  | "autumn"
  | "celestial"
  | "void";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  icon: string;
  color: string;
  backgroundType: BackgroundType;
  sceneId: SceneId;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "ocean",
    label: "Ocean",
    icon: "fa-water",
    color: "#0ea5e9",
    backgroundType: BackgroundType.OCEAN,
    sceneId: "ocean",
  },
  {
    id: "cosmic",
    label: "Cosmic",
    icon: "fa-moon",
    color: "#8b5cf6",
    backgroundType: BackgroundType.COSMIC,
    sceneId: "cosmic",
  },
  {
    id: "forest",
    label: "Forest",
    icon: "fa-tree",
    color: "#22c55e",
    backgroundType: BackgroundType.FOREST,
    sceneId: "forest",
  },
  {
    id: "blossom",
    label: "Blossom",
    icon: "fa-spa",
    color: "#f472b6",
    backgroundType: BackgroundType.BLOSSOM,
    sceneId: "blossom",
  },
  {
    id: "rainbow",
    label: "Rainbow",
    icon: "fa-rainbow",
    color: "#f59e0b",
    backgroundType: PRIDE_BACKGROUND_TYPE,
    sceneId: "rainbow",
  },
  {
    id: "ember",
    label: "Ember",
    icon: "fa-fire",
    color: "#ef4444",
    backgroundType: BackgroundType.EMBER,
    sceneId: "ember",
  },
  {
    id: "winter",
    label: "Winter",
    icon: "fa-snowflake",
    color: "#67e8f9",
    backgroundType: BackgroundType.WINTER,
    sceneId: "winter",
  },
  {
    id: "autumn",
    label: "Autumn",
    icon: "fa-leaf",
    color: "#d97706",
    backgroundType: BackgroundType.AUTUMN,
    sceneId: "autumn",
  },
  {
    id: "celestial",
    label: "Celestial",
    icon: "fa-star",
    color: "#4a9ae8",
    backgroundType: BackgroundType.CELESTIAL,
    sceneId: "celestial",
  },
  {
    id: "void",
    label: "Void",
    icon: "fa-square",
    color: "#6b7280",
    backgroundType: BackgroundType.VOID,
    sceneId: "void",
  },
];

export function getThemeOption(id: ThemeId): ThemeOption | undefined {
  return THEME_OPTIONS.find((t) => t.id === id);
}
