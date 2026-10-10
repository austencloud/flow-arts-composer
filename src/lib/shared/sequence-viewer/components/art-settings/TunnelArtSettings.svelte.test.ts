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

async function pickTriadVersion2() {
  await page.getByRole("button", { name: "Choose Triad style" }).click();
  await page
    .getByRole("button", { name: "Select Triad V2 prop type", exact: true })
    .click();
}

describe("TunnelArtSettings prop version", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // The Tunnel creator passes its own look and writer, so a Version 2 pick
  // reaches it with the prop and never changes the account's version.
  it("hands a Version 2 pick to a host that owns the version", async () => {
    const onPropChange = vi.fn();
    const onPropLookChange = vi.fn();
    renderPanel({ onPropChange, propLook: "pictograph", onPropLookChange });

    await pickTriadVersion2();

    expect(onPropChange).toHaveBeenLastCalledWith(PropType.TRIAD, "model");
    expect(onPropLookChange).toHaveBeenLastCalledWith("model");
    expect(mocks.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ propArtwork: expect.anything() })
    );
  });

  // The viewer's Art pane passes neither, and keeps editing the account's
  // version. This is the control that lets the assertion above fail.
  it("writes the account when the host passes no version writer", async () => {
    renderPanel({ onPropChange: vi.fn() });

    await pickTriadVersion2();

    expect(mocks.updateSettings).toHaveBeenCalledWith({ propArtwork: "model" });
  });
});
