import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import SaveSceneModal from "./SaveSceneModal.svelte";

const mocks = vi.hoisted(() => ({
  viewer: null as unknown,
}));

vi.mock("#lib/shared/3d/context/viewer-3d-context.js", () => ({
  tryGetViewer3DContext: () => mocks.viewer,
}));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: { settings: {} },
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../services/capture-3d-scene", () => ({
  captureScene3DSnapshot: vi.fn(),
  captureScene3DPoster: () => "",
}));
vi.mock("../state/scene-3d-collection-state.svelte", () => ({
  scene3dCollectionState: { add: vi.fn() },
}));

function fakeViewer(steps: number) {
  return {
    currentSequenceData:
      steps > 0
        ? {
            word: "ABC",
            name: "ABC",
            steps: Array.from({ length: steps }, () => ({})),
          }
        : null,
    performerManager: { performers: [] },
    defaultSettings: { prop: "staff", effortId: "flow" },
    effectToggles: {},
    activeFormation: "manual",
    propSizeLinked: true,
    environmentId: SceneEnvironmentId.OCEAN,
    oceanVariant: "calm",
    navMode: "orbit",
    activeCameraPreset: "default",
    visiblePlanes: [],
  };
}

describe("SaveSceneModal reset on open", () => {
  beforeEach(async () => {
    await page.viewport(760, 800);
  });

  // Opening with no steps used to assign `enabled` and then write
  // `enabled.performance` in the same effect, which re-queued the effect until
  // Svelte threw effect_update_depth_exceeded and the app fell to its error
  // screen.
  it("opens without steps, with the Performance group off", async () => {
    mocks.viewer = fakeViewer(0);
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", onError);

    render(SaveSceneModal, { open: true });

    const performance = page.getByRole("switch", { name: /Performance/ });
    await expect.element(performance).toBeInTheDocument();
    await expect.element(performance).toHaveAttribute("aria-checked", "false");
    await expect.element(performance).toBeDisabled();
    await expect
      .element(page.getByRole("switch", { name: /Performers/ }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByText("Everything selected"))
      .toBeInTheDocument();

    window.removeEventListener("error", onError);
    expect(errors).toEqual([]);
  });

  it("opens with steps and every group on", async () => {
    mocks.viewer = fakeViewer(3);

    render(SaveSceneModal, { open: true });

    await expect
      .element(page.getByRole("switch", { name: /Performance/ }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByText("Everything selected"))
      .toBeInTheDocument();
  });
});
