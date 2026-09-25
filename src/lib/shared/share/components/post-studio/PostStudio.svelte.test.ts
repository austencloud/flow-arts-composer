import { render } from "vitest-browser-svelte";
import { flushSync } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import { createViewerUrlSession } from "$lib/shared/sequence-viewer/services/viewer-url-session";
import { encodeViewerStateParams } from "$lib/shared/sequence-viewer/services/viewer-url-state-codec";
import { createViewerStudioSurfaces } from "$lib/shared/sequence-viewer/state/viewer-studio-surfaces.svelte";
import PostStudioTestHarness from "./PostStudioTestHarness.svelte";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

// The studio looks up the sequence's saved performances on mount. That read
// is a Firestore query; here the sequence simply has none.
vi.mock(
  "$lib/shared/video-collaboration/services/collaborative-video-manager",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("$lib/shared/video-collaboration/services/collaborative-video-manager")
    >()),
    getVideosForSequence: async () => [],
  })
);

// The canvas renders the card and animation from static art the component
// test server does not serve. The prop under test lives in the studio itself.
vi.mock("./builder/PostBuilderCanvas.svelte", async () => ({
  default: (
    await import("$lib/shared/sequence-viewer/components/__test-stubs__/SequenceViewerDrawerHostChildStub.svelte")
  ).default,
}));

// The studio's tempo grid needs at least one step.
const sequence = createSequenceData({
  id: "post-studio-prop-sync",
  name: "A",
  word: "A",
  steps: [createStepData({ letter: "A" })],
});

/**
 * Shift+P and the Firestore settings listener (another tab or device) land the
 * same way: the shared settings prop changes under a mounted studio.
 */
function changeSettingsProp(prop: PropType): void {
  void settingsService.updateSettings({
    leftPropType: prop,
    rightPropType: prop,
  });
  flushSync();
}

function seededUrl(prop: PropType): URLSearchParams {
  return new URLSearchParams(
    encodeViewerStateParams({ ps: { propType: prop } }).set
  );
}

function mountStudio(url = new URLSearchParams()) {
  const session = createViewerUrlSession(url, { writeParams: () => undefined });
  const surfaces = createViewerStudioSurfaces();
  surfaces.enter(0, false, 60);
  render(PostStudioTestHarness, { sequence, session, surfaces });
  flushSync();
  const controls = () => {
    const current = surfaces.controls;
    if (!current) throw new Error("Post Studio registered no controls");
    return current;
  };
  return { session, controls };
}

describe("Post Studio prop against the settings prop", () => {
  beforeEach(() => {
    changeSettingsProp(PropType.STAFF);
  });

  it("captures no propType when the settings prop changes under an untouched studio", () => {
    const { session } = mountStudio();

    changeSettingsProp(PropType.FAN);

    expect(session.captureNow().ps).toBeUndefined();
  });

  it("shows the live settings prop until the studio's own prop is picked", () => {
    const { controls } = mountStudio();

    changeSettingsProp(PropType.FAN);

    expect(controls().propType).toBe(PropType.FAN);
  });

  it("keeps an explicit pick, and its capture, whatever the settings prop does", () => {
    const { session, controls } = mountStudio();
    controls().setProp(PropType.CLUB);
    flushSync();

    for (const settingsProp of [PropType.CLUB, PropType.FAN]) {
      changeSettingsProp(settingsProp);
      expect(controls().propType).toBe(PropType.CLUB);
      expect(session.captureNow().ps).toEqual({ propType: PropType.CLUB });
    }
  });

  it("keeps a URL-seeded prop as an override whatever the settings prop does", () => {
    const { session, controls } = mountStudio(seededUrl(PropType.TRIAD));

    for (const settingsProp of [PropType.TRIAD, PropType.FAN]) {
      changeSettingsProp(settingsProp);
      expect(controls().propType).toBe(PropType.TRIAD);
      expect(session.captureNow().ps).toEqual({ propType: PropType.TRIAD });
    }
  });
});
