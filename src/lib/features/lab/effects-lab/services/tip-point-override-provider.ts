import {
  PROP_RENDER_KEY_TIP_POINTS,
  PROP_TIP_POINTS,
  type PropTipConfig,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import type { EffectPoint } from "./types";
import type { EffectPointsPersister } from "./effect-points-persister";
import type { TrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";

/** Deep-copy that works on Svelte 5 $state proxies (structuredClone cannot clone them). */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Unified tip point override provider backed by shared EffectPointsPersister.
 *
 * Position-only tip configs ({ dx, dy }) are stored in Firestore via the
 * persister. All users read from the same document, so admin edits propagate
 * globally in real time.
 *
 * Fallback chain (highest to lowest priority):
 * 1. Points from EffectPointsPersister (Firebase-backed)
 * 2. Admin-published defaults
 */
export class TipPointOverrideProvider {
  private publishedDefaults: Map<string, PropTipConfig>;

  constructor(private readonly persister: EffectPointsPersister) {
    this.publishedDefaults = new Map();
  }

  getOverride(propType: string): PropTipConfig | null {
    const key = propType.toLowerCase();
    const stored = this.persister.getPoints(key);
    if (stored) {
      return {
        points: stored.map((p) => ({ dx: p.dx, dy: p.dy })),
      };
    }
    return this.publishedDefaults.get(key) ?? null;
  }

  saveOverride(propType: string, config: PropTipConfig): void {
    const key = propType.toLowerCase();
    const points: EffectPoint[] = config.points.map((p) => ({ dx: p.dx, dy: p.dy }));
    this.persister.save(key, points);
  }

  clearOverride(propType: string): void {
    const key = propType.toLowerCase();
    this.persister.save(key, []);
  }

  hasOverride(propType: string): boolean {
    const key = propType.toLowerCase();
    return this.persister.getPoints(key) !== null;
  }

  getOverriddenTypes(): string[] {
    const types: string[] = [];
    for (const key of [
      ...Object.keys(PROP_TIP_POINTS),
      ...Object.keys(PROP_RENDER_KEY_TIP_POINTS),
    ]) {
      if (this.persister.getPoints(key) !== null) {
        types.push(key);
      }
    }
    return types;
  }

  exportAll(): Record<string, PropTipConfig> {
    const result: Record<string, PropTipConfig> = {};
    for (const key of this.getOverriddenTypes()) {
      const override = this.getOverride(key);
      if (override) {
        result[key] = deepCopy(override);
      }
    }
    return result;
  }

  importAll(overrides: Record<string, PropTipConfig>): void {
    for (const [key, config] of Object.entries(overrides)) {
      if (this.isValidConfig(config)) {
        this.saveOverride(key, config);
      }
    }
  }

  loadPublishedDefaults(defaults: Record<string, PropTipConfig>): void {
    this.publishedDefaults.clear();
    for (const [key, config] of Object.entries(defaults)) {
      this.publishedDefaults.set(key.toLowerCase(), deepCopy(config));
    }
  }

  saveUserDefault(propType: string, config: PropTipConfig): void {
    this.saveOverride(propType, config);
  }

  /**
   * Only points the lab stored count as the user's default. A published
   * default is not one (hasUserDefault agrees), so a reset with nothing
   * stored lands on the code table, not on the published copy of it.
   */
  getUserDefault(propType: string): PropTipConfig | null {
    const stored = this.persister.getPoints(propType.toLowerCase());
    return stored ? { points: stored.map((p) => ({ dx: p.dx, dy: p.dy })) } : null;
  }

  hasUserDefault(propType: string): boolean {
    return this.hasOverride(propType);
  }

  clearUserDefault(propType: string): void {
    this.clearOverride(propType);
  }

  getUserDefaultTypes(): string[] {
    return this.getOverriddenTypes();
  }

  getTrailAssignment(propType: string): TrailPointConfig | null {
    const key = propType.toLowerCase();
    return this.persister.getTrailAssignment(key);
  }

  saveTrailAssignment(propType: string, config: TrailPointConfig): void {
    const key = propType.toLowerCase();
    this.persister.saveTrailAssignment(key, config);
  }

  getTrailAssignmentTypes(): string[] {
    return this.persister.getTrailAssignmentTypes();
  }

  removeTrailAssignment(propType: string): void {
    const key = propType.toLowerCase();
    this.persister.removeTrailAssignment(key);
  }

  private isValidConfig(config: unknown): config is PropTipConfig {
    if (!config || typeof config !== "object") return false;
    const c = config as Record<string, unknown>;
    if (!Array.isArray(c.points)) return false;
    return c.points.every(
      (p: unknown) =>
        p !== null &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).dx === "number" &&
        typeof (p as Record<string, unknown>).dy === "number"
    );
  }
}
