/**
 * Static ownership contract for the ArtSettingsPanel split.
 *
 * The public component is a stable dispatcher. Mandala and Tunnel own their
 * product layouts, the frame owns desktop card chrome, and each substantial
 * tunnel rail section owns its own presentation. If this fails, move the
 * behavior to its owner instead of relaxing the boundary.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const COMPONENT_DIR = "src/lib/shared/sequence-viewer/components/art-settings";

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const messagesEn: Record<string, string> = JSON.parse(
  read("messages/en.json")
);

function settingsFile(filename: string): string {
  return read(`${COMPONENT_DIR}/${filename}`);
}

describe("ArtSettingsPanel split contract", () => {
  it("keeps the public panel as a style-free product dispatcher", () => {
    const source = read(
      "src/lib/shared/sequence-viewer/components/ArtSettingsPanel.svelte"
    );

    expect(source).not.toContain("<style");
    expect(source.split("\n").length).toBeLessThan(100);
    for (const owner of ["TunnelArtSettings", "MandalaArtSettings"]) {
      expect(source).toContain(`import ${owner}`);
      expect(source).toContain(`<${owner}`);
    }
  });

  it("keeps desktop card chrome in the shared frame only", () => {
    const frame = settingsFile("ArtSettingsSidebarFrame.svelte");
    expect(frame).toContain('class="art-settings-panel"');
    expect(frame).toContain(".art-settings-panel");

    for (const filename of [
      "MandalaArtSettings.svelte",
      "TunnelArtSettings.svelte",
      "TunnelLookSettings.svelte",
      "TunnelPresetBrowser.svelte",
      "TunnelPrimitiveTuner.svelte",
      "TunnelSpeedSettings.svelte",
      "TunnelEffectsSettings.svelte",
      "TunnelColorSettings.svelte",
      "TunnelPlaybackSettings.svelte",
    ]) {
      expect(
        settingsFile(filename),
        `${filename} owns frame chrome`
      ).not.toContain(".art-settings-panel");
    }
  });

  it("routes every substantial tunnel rail section to its owner", () => {
    const coordinator = settingsFile("TunnelArtSettings.svelte");
    const owners = [
      "TunnelLookSettings",
      "TunnelSpeedSettings",
      "TunnelEffectsSettings",
      "TunnelDisplaySettings",
      "TunnelMotionSettings",
      "TunnelPlaybackSettings",
      "TunnelPropSettings",
    ];

    expect(coordinator.split("\n").length).toBeLessThan(500);
    for (const owner of owners) {
      expect(coordinator).toContain(`import ${owner}`);
      expect(coordinator).toContain(`<${owner}`);
    }

    for (const leakedSelector of [
      ".preset-grid",
      ".fill-grid",
      ".effects-layout",
      ".playback-rows",
    ]) {
      expect(coordinator).not.toContain(leakedSelector);
    }
  });

  it("lets the Tunnel dock tray size itself around the Display rows", () => {
    // The dock tray takes its height from its content. Display rows left at
    // `flex: 1 1 0` there report zero: the tray opens empty, the viewer's mode
    // bar ducks away, and the phone shows no Display options.
    const display = settingsFile("TunnelDisplaySettings.svelte");
    expect(display).toContain('class="display-rows" class:dense');
    expect(display).toMatch(
      /\.display-rows\.dense,\s*\.display-rows\.dense \.rt-section \{\s*flex: 0 0 auto;/
    );
  });

  it("keeps Tunnel Effects identical and moves copy colors to Formation", () => {
    const effects = settingsFile("TunnelEffectsSettings.svelte");
    const look = settingsFile("TunnelLookSettings.svelte");
    const colors = settingsFile("TunnelColorSettings.svelte");

    expect(effects).toContain("<EffectsPanel");
    expect(effects).not.toContain("<SegmentedControl");
    expect(effects).not.toContain("Tunnel colors");
    expect(look).toContain("<TunnelColorSettings");
    // "Tunnel colors" now lives behind an i18n key (German coverage); confirm
    // both the key is used here AND that key still resolves to that English text.
    expect(colors).toContain('>{t("viewer_detail_tunnel_colors")}</span>');
    expect(messagesEn.viewer_detail_tunnel_colors).toBe("Tunnel colors");
  });

  it("keeps the Look coordinator separate from its two product surfaces", () => {
    const look = settingsFile("TunnelLookSettings.svelte");

    expect(look.split("\n").length).toBeLessThan(150);
    for (const owner of [
      "TunnelPresetBrowser",
      "TunnelPrimitiveTuner",
      "TunnelColorSettings",
    ]) {
      expect(look).toContain(`import ${owner}`);
      expect(look).toContain(`<${owner}`);
    }

    for (const leakedSelector of [
      ".preset-grid",
      ".tuner-hero",
      ".prim-chip-grid",
      ".save-preset-btn",
    ]) {
      expect(look).not.toContain(leakedSelector);
    }
  });

  it("preserves the consumer-facing prop seam", () => {
    const seam = settingsFile("art-settings-types.ts");
    for (const prop of [
      "sequence",
      "playback",
      "controller",
      "mandalaController",
      "artType",
      "layout",
      "onExport",
      "onSaveTunnel",
      "bpm",
      "playbackMode",
      "stepSize",
      "isPlaying",
      "onBpmChange",
      "onPlaybackModeChange",
      "onStepSizeChange",
      "onPlaybackToggle",
      "leftPropType",
      "rightPropType",
      "onPropChange",
      "onArtSettingChange",
      "exporting",
    ]) {
      expect(seam, `public prop ${prop} was dropped`).toMatch(
        new RegExp(`^\\s*${prop}[?]?:`, "m")
      );
    }
  });
});
