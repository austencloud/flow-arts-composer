import { BackgroundType } from "@austencloud/backgrounds";
import {
  getCardMetadata,
  type BackgroundCardMetadata,
} from "@austencloud/backgrounds/card";
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

export interface ThemeCameraFraming {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface ShowroomTheme {
  id: BackgroundType;
  label: string;
  icon: string;
  number: string;
  card: BackgroundCardMetadata;
  camera: ThemeCameraFraming;
}

const THEME_DEFINITIONS: Array<Omit<ShowroomTheme, "card" | "number">> = [
  {
    id: BackgroundType.EMBER,
    label: "Ember",
    icon: "fa-fire",
    camera: { position: [8.5, 3.8, 10.5], target: [0, 0.75, 0], fov: 49 },
  },
  {
    id: BackgroundType.COSMIC,
    label: "Cosmic",
    icon: "fa-moon",
    camera: { position: [10, 5.5, 14], target: [0, 1.5, 0], fov: 52 },
  },
  {
    id: BackgroundType.OCEAN,
    label: "Ocean",
    icon: "fa-water",
    camera: { position: [9, 4.3, 11.5], target: [0, 0.9, 0], fov: 50 },
  },
  {
    id: BackgroundType.FOREST,
    label: "Forest",
    icon: "fa-tree",
    camera: { position: [8, 4.2, 10], target: [0, 1, 0], fov: 48 },
  },
  {
    id: BackgroundType.WINTER,
    label: "Winter",
    icon: "fa-snowflake",
    camera: {
      position: [0, 34, 52],
      target: [0, 1, 0],
      fov: 48,
      minDistance: 16,
      maxDistance: 85,
    },
  },
  {
    id: PRIDE_BACKGROUND_TYPE,
    label: "Rainbow",
    icon: "fa-rainbow",
    camera: { position: [8, 4.5, 11], target: [0, 1.2, 0], fov: 50 },
  },
  {
    id: BackgroundType.BLOSSOM,
    label: "Blossom",
    icon: "fa-spa",
    camera: { position: [7.5, 3.8, 9.5], target: [0, 1, 0], fov: 48 },
  },
  {
    id: BackgroundType.AUTUMN,
    label: "Autumn",
    icon: "fa-leaf",
    camera: { position: [7.5, 3.5, 9], target: [0, 0.9, 0], fov: 48 },
  },
  {
    id: BackgroundType.CELESTIAL,
    label: "Celestial",
    icon: "fa-star",
    camera: { position: [9, 5.2, 12], target: [0, 1.4, 0], fov: 51 },
  },
  {
    id: BackgroundType.VOID,
    label: "Void",
    icon: "fa-square",
    camera: { position: [7.5, 3.5, 9.5], target: [0, 0.9, 0], fov: 48 },
  },
];

export const SHOWROOM_THEMES: ShowroomTheme[] = THEME_DEFINITIONS.map(
  (theme, index) => {
    const card = getCardMetadata(theme.id);
    if (!card) {
      throw new Error(`Missing background card metadata for ${theme.id}`);
    }

    return {
      ...theme,
      card,
      number: String(index + 1).padStart(2, "0"),
    };
  }
);

export function getShowroomTheme(
  backgroundType: BackgroundType
): ShowroomTheme {
  return (
    SHOWROOM_THEMES.find((theme) => theme.id === backgroundType) ??
    SHOWROOM_THEMES[0]!
  );
}

export function getShowroomThemeFromId(
  value: string | null
): BackgroundType | undefined {
  return SHOWROOM_THEMES.find((theme) => theme.id === value)?.id;
}
