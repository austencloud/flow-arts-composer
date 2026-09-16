import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getTipPointsBaseline,
  setTipPointOverrideProvider,
} from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { TipPointOverrideProvider } from "../../services/tip-point-override-provider";
import type { EffectPointsPersister } from "../../services/effect-points-persister";
import type { EffectPoint } from "../../services/types";
import { EffectPointEditorState } from "../effect-point-editor-state.svelte";

/**
 * In-memory stand-in for the Firestore-backed persister: the editor only
 * needs point storage and change notification.
 */
class FakePersister {
  points: Record<string, EffectPoint[]> = {};
  save(propType: string, points: EffectPoint[]): void {
    this.points[propType.toLowerCase()] = points.map((p) => ({ ...p }));
  }
  getPoints(propType: string): EffectPoint[] | null {
    const pts = this.points[propType.toLowerCase()];
    if (!pts || pts.length === 0) return null;
    return pts.map((p) => ({ ...p }));
  }
  getTrailAssignment(): null {
    return null;
  }
  getTrailAssignmentTypes(): string[] {
    return [];
  }
  saveTrailAssignment(): void {}
  removeTrailAssignment(): void {}
  subscribe(): () => void {
    return () => {};
  }
}

const CUSTOM_FAN = [{ dx: 10, dy: -20 }];

describe("EffectPointEditorState override visibility", () => {
  let persister: FakePersister;
  let provider: TipPointOverrideProvider;

  beforeEach(() => {
    persister = new FakePersister();
    provider = new TipPointOverrideProvider(
      persister as unknown as EffectPointsPersister
    );
    // The app registers the lab provider as the domain override source; the
    // editor must see the same resolution the animation canvas sees.
    setTipPointOverrideProvider((propType) => provider.getOverride(propType));
  });

  afterEach(() => {
    setTipPointOverrideProvider(null);
  });

  it("reports when the stored points are overriding the code table", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    expect(state.isOverridingCodeTable).toBe(true);
    expect(state.tipSource).toBe("override");
    expect(state.points).toEqual(CUSTOM_FAN);
    state.dispose();
  });

  it("reports the code table when nothing is stored", () => {
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    expect(state.isOverridingCodeTable).toBe(false);
    expect(state.tipSource).toBe("base");
    expect(state.points).toEqual(getTipPointsBaseline("fan").points);
    state.dispose();
  });

  it("returns to the code table and clears the stored override", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    state.useCodeTable();
    expect(persister.getPoints("fan")).toBeNull();
    expect(state.points).toEqual(getTipPointsBaseline("fan").points);
    expect(state.isOverridingCodeTable).toBe(false);
    expect(state.tipSource).toBe("base");
    state.dispose();
  });

  it("resets to the code table, not a published default, when the user has none", () => {
    provider.loadPublishedDefaults({ fan: { points: CUSTOM_FAN } });
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    state.resetToUserDefault();
    expect(state.points).toEqual(getTipPointsBaseline("fan").points);
    state.dispose();
  });
});
