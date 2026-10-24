import { Color, FogExp2 } from "three";
import type { WingTheme } from "../domain/museum-grid-types";

const WING_FOG: Record<WingTheme, { density: number; color: string }> = {
  cave: { density: 0.06, color: "#1a1008" },
  classical: { density: 0.03, color: "#1a1510" },
  renaissance: { density: 0.03, color: "#14120e" },
  industrial: { density: 0.04, color: "#141414" },
  digital: { density: 0.04, color: "#0a0a14" },
  institutional: { density: 0.02, color: "#606068" },
  gallery: { density: 0.02, color: "#0e0a10" },
  modern: { density: 0.03, color: "#0a0a0a" },
  futuristic: { density: 0.03, color: "#0a0a10" },
  outdoor: { density: 0.008, color: "#2a2418" },
  construction: { density: 0.04, color: "#14120a" },
  retail: { density: 0.02, color: "#141210" },
};

const FOG_LERP_SPEED = 2.0;

export class MuseumAtmosphere {
  readonly fog = new FogExp2("#1a1008", 0.08);
  private colorTarget = new Color("#1a1008");
  private colorCurrent = new Color("#1a1008");
  private densityTarget = 0.08;
  private currentWingTheme: WingTheme | null = null;

  getCurrentWing(): WingTheme | null {
    return this.currentWingTheme;
  }

  /**
   * @param vacuum Rooms that are outdoors on an airless body. Fog is scattering
   *   by suspended particles; with no atmosphere there is nothing to scatter,
   *   which is why the Moon's horizon is a hard line at kilometres rather than
   *   a fade at thirty metres. The cave wing's 0.06 density swallowed the Moon
   *   room's mare whole. The wing theme still tracks normally underneath, so
   *   walking back into the Sun restores the wing's fog without a special case
   *   at the door.
   * @param roomFog A room that brings its own air, as the village's forest
   *   night does. It overrides the wing's fog while the visitor is inside.
   */
  update(
    theme: WingTheme | null,
    fpsActive: boolean,
    delta: number,
    vacuum = false,
    roomFog: { color: string; density: number } | null = null,
  ): boolean {
    let wingChanged = false;

    if (theme && theme !== this.currentWingTheme) {
      this.currentWingTheme = theme;
      const fogCfg = WING_FOG[theme];
      this.colorTarget.set(fogCfg.color);
      this.densityTarget = fogCfg.density;
      wingChanged = true;
    }

    if (vacuum) {
      this.colorTarget.set("#000000");
      this.densityTarget = 0;
    } else if (roomFog) {
      this.colorTarget.set(roomFog.color);
      this.densityTarget = roomFog.density;
    } else if (this.currentWingTheme) {
      const fogCfg = WING_FOG[this.currentWingTheme];
      this.colorTarget.set(fogCfg.color);
      this.densityTarget = fogCfg.density;
    }

    if (fpsActive) {
      this.colorCurrent.lerp(this.colorTarget, FOG_LERP_SPEED * delta);
      this.fog.color.copy(this.colorCurrent);
      this.fog.density +=
        (this.densityTarget - this.fog.density) * FOG_LERP_SPEED * delta;
    } else {
      this.fog.density += (0 - this.fog.density) * FOG_LERP_SPEED * delta;
    }

    return wingChanged;
  }
}
