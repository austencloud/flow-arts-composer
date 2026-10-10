import { describe, expect, it, vi } from "vitest";
import type CameraControls from "camera-controls";
import { createComposerEditorState } from "#lib/shared/3d/scene-composer/composer-editor-state.svelte.js";

describe("composer editor camera arbitration", () => {
  it("stops and disables orbit controls for the entire gizmo drag", () => {
    const stop = vi.fn();
    const controls = {
      enabled: true,
      stop,
    } as unknown as CameraControls;
    const state = createComposerEditorState();

    state.setOrbitControls(controls);
    state.setGizmoDragging(true);

    expect(stop).toHaveBeenCalledOnce();
    expect(controls.enabled).toBe(false);
    expect(state.gizmoDragging).toBe(true);

    state.setGizmoDragging(false);

    expect(controls.enabled).toBe(true);
    expect(state.gizmoDragging).toBe(false);
  });
});
