import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";
import TunnelArtSettings from "./TunnelArtSettings.svelte";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

// The account writer is the one BentoPropGrid falls back to. Component tests
// never start app services, so the write call is what shows whether a pick
// reached the account.
vi.mock(
  "#lib/shared/application/state/app-state.svelte.js",
  async (original) => ({
    ...(await original<
      typeof import("#lib/shared/application/state/app-state.svelte.js")
    >()),
    updateSettings: mocks.updateSettings,
  })
);

// Only the Props section is open, so the panel reads little from the controller.
const controller = {
  section: "props",
  presetRecipe: null,
  performerCount: 1,
  hasSpeedOverrides: false,
} as unknown as TunnelViewController;

function renderPanel(props: Record<string, unknown>) {
  render(TunnelArtSettings, {
    controller,
    layout: "sidebar",
    onExport: vi.fn(),
    showExport: false,
    bpm: 60,
    playbackMode: "continuous",
    isPlaying: true,
    onBpmChange: vi.fn(),
    onPlaybackModeChange: vi.fn(),
    onPlaybackToggle: vi.fn(),
    leftPropType: PropType.STAFF,
    exporting: false,
    reduceMotion: true,
    ...props,
  });
}

describe("TunnelArtSettings prop pick", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // The Tunnel creator owns its props, so a family pick reaches it as the
  // prop alone. Each style has one tile, with no version.
  it("hands a family pick to the host as the prop alone", async () => {
    const onPropChange = vi.fn();
    renderPanel({ onPropChange });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await expect
      .element(page.getByRole("button", { name: /V2/ }))
      .not.toBeInTheDocument();
    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();

    expect(onPropChange).toHaveBeenLastCalledWith(PropType.TRIAD);
    expect(onPropChange.mock.lastCall).toHaveLength(1);
    expect(mocks.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ propArtwork: expect.anything() })
    );
  });
});
