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
  saves = 0;
  private subscribers = new Set<() => void>();
  save(propType: string, points: EffectPoint[]): void {
    this.saves++;
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
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  notify(): void {
    for (const callback of this.subscribers) callback();
  }
}

const CUSTOM_FAN = [{ dx: 10, dy: -20 }];

describe("EffectPointEditorState override visibility", () => {
  let persister: FakePersister;
  let provider: TipPointOverrideProvider;

  beforeEach(() => {
    localStorage.clear();
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
    localStorage.clear();
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

  it("undoes coordinate edits and skips unchanged edits", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    const saves = persister.saves;
    state.updatePoint(0, { dx: 10 });
    state.movePoint(0, { dx: 10, dy: -20 });
    expect(state.canUndo).toBe(false);
    expect(persister.saves).toBe(saves);

    state.updatePoint(0, { dx: 15 });
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.points).toEqual(CUSTOM_FAN);
    expect(persister.getPoints("fan")).toEqual(CUSTOM_FAN);
    expect(state.canUndo).toBe(false);
    state.dispose();
  });

  it("records one drag step only when the point finishes elsewhere", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    const saves = persister.saves;
    state.beginDrag(0);
    state.endDrag();
    expect(state.canUndo).toBe(false);
    expect(persister.saves).toBe(saves);

    state.beginDrag(0);
    state.updatePointPosition(0, 11, -20);
    state.updatePointPosition(0, 12, -20);
    state.endDrag();
    state.undo();
    expect(state.points).toEqual(CUSTOM_FAN);
    expect(state.canUndo).toBe(false);

    state.beginDrag(0);
    state.updatePointPosition(0, 11, -20);
    state.updatePointPosition(0, 10, -20);
    state.endDrag();
    expect(state.canUndo).toBe(false);
    state.dispose();
  });

  it("restores the code table after an out-and-back drag and keeps earlier history on a click", () => {
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    const first = state.points[0];
    if (!first) throw new Error("fan has no code-table tip point");
    const original = { ...first };
    state.beginDrag(0);
    state.updatePointPosition(0, original.dx + 1, original.dy);
    state.updatePointPosition(0, original.dx, original.dy);
    state.endDrag();
    expect(state.canUndo).toBe(false);
    expect(persister.getPoints("fan")).toBeNull();
    expect(state.isUsingOverride).toBe(false);

    state.movePoint(0, { dx: original.dx + 2 });
    state.beginDrag(0);
    state.endDrag();
    expect(state.canUndo).toBe(true);
    state.undo();
    expect(state.points[0]).toEqual(original);
    expect(persister.getPoints("fan")).toBeNull();
    state.dispose();
  });

  it("restores the code table as the source when undoing a first edit", () => {
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    const baseline = getTipPointsBaseline("fan").points;
    state.addPoint(3, 4);
    expect(state.isUsingOverride).toBe(true);
    state.undo();
    expect(state.points).toEqual(baseline);
    expect(state.isUsingOverride).toBe(false);
    expect(persister.getPoints("fan")).toBeNull();
    state.dispose();
  });

  it("restores the previous override when undoing Use code table", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(provider);
    state.selectPropType("fan");
    state.useCodeTable();
    state.undo();
    expect(state.points).toEqual(CUSTOM_FAN);
    expect(persister.getPoints("fan")).toEqual(CUSTOM_FAN);
    expect(state.isUsingOverride).toBe(true);
    state.dispose();
  });

  it("discards stale undo history after an external restore and isolates props", () => {
    persister.save("fan", CUSTOM_FAN);
    const state = new EffectPointEditorState(
      provider,
      persister as unknown as EffectPointsPersister,
    );
    state.selectPropType("fan");
    state.updatePoint(0, { dx: 15 });
    state.selectPropType("staff");
    expect(state.canUndo).toBe(false);
    state.selectPropType("fan");
    state.updatePoint(0, { dx: 20 });
    expect(state.canUndo).toBe(true);
    persister.save("fan", [{ dx: 99, dy: 1 }]);
    // The editor defers a snapshot while its own save indicator is visible.
    state.saveIndicatorVisible = false;
    persister.notify();
    expect(state.points).toEqual([{ dx: 99, dy: 1 }]);
    expect(state.canUndo).toBe(false);
    state.dispose();
  });
});
