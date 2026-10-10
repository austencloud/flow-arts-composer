// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "#lib/shared/i18n/i18n.svelte.js";
import { siteCopy } from "#lib/shared/landing/site-copy.js";
import { createViewerEditModeState } from "#lib/shared/sequence-viewer/state/viewer-edit-mode-state.svelte.js";
import { guideTurnDisplayWord } from "../../src/routes/(public)/guide/level-1/_data/guide-turn-display-word";

const { default: DurationResizeHandle } =
  await import("#lib/features/create/shared/workspace-panel/sequence-display/components/DurationResizeHandle.svelte");

const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
const originalCreateElement = document.createElement;

afterEach(async () => {
  document.createElement = originalCreateElement;
  await setLocale("en");
  document.cookie = "PARAGLIDE_LOCALE=; max-age=0; path=/";
});

describe("German runtime display", () => {
  it("uses singular for exactly one beat and plural for fractional durations", async () => {
    document.createElement = realCreateElement.bind(document);
    await setLocale("de");
    const host = document.createElement("div");
    document.body.append(host);

    for (const [duration, label] of [
      [1, "Dauer ändern: 1 Taktschlag"],
      [1.5, "Dauer ändern: 1,5 Taktschläge"],
      [2, "Dauer ändern: 2 Taktschläge"],
    ] as const) {
      const component = mount(DurationResizeHandle, {
        target: host,
        props: {
          currentDuration: duration,
          onDragStart: () => {},
          onDrag: () => {},
          onDragEnd: () => {},
          onStepAdjust: () => {},
        },
      });
      flushSync();
      const handle = host.querySelector('[role="separator"]');
      expect(handle?.getAttribute("aria-label")).toBe(label);
      expect(handle?.getAttribute("aria-roledescription")).toBe(
        "Regler zum Ändern der Dauer"
      );
      unmount(component);
    }
    host.remove();
  });

  it("localizes guide display titles and footer copy without replacing sequence words", async () => {
    const words = [
      "Prospin with a turn",
      "Antispin with a turn",
      "Dash with a turn",
      "Static turn",
      "Prospin with 2 turns",
      "Antispin with 2 turns",
      "Dash with 2 turns",
      "Static with 2 turns",
    ];
    const before = [...words];
    await setLocale("de");
    expect(words.map(guideTurnDisplayWord)).toEqual([
      "Prospin mit einer Drehung",
      "Antispin mit einer Drehung",
      "Dash mit einer Drehung",
      "Static-Drehung",
      "Prospin mit 2 Drehungen",
      "Antispin mit 2 Drehungen",
      "Dash mit 2 Drehungen",
      "Static mit 2 Drehungen",
    ]);
    expect(guideTurnDisplayWord("S and T")).toBe("S and T");
    expect(siteCopy("Trick names")).toBe("Tricknamen");
    expect(words).toEqual(before);
  });

  it("announces each viewer export mode and close state in German", async () => {
    await setLocale("de");
    const spoken: string[] = [];
    let videoUploadOpen = false;
    const state = createViewerEditModeState({
      viewerState: {
        splitConfig: { leftPane: "animation" },
        enterExport: () => {},
        exitExport: () => {},
        get videoUploadOpen() {
          return videoUploadOpen;
        },
        openVideoUpload: () => {
          videoUploadOpen = true;
        },
        closeVideoUpload: () => {
          videoUploadOpen = false;
        },
      } as never,
      playback: { isPlayingLocal: false } as never,
      interactive: { hapticService: null, playbackController: null } as never,
      exportCoordinator: { dismissPreview: () => {} } as never,
      modalAnimationState: {} as never,
      accessibilityHelper: {
        announce: (message: string) => spoken.push(message),
      } as never,
      getEditingPane: () => null,
      getEffectiveSequence: () => null,
      getIsHandPath: () => false,
      getResolvedCardAutoLayout: () => null,
    });

    state.enterEditMode("animation");
    state.enterEditMode("image");
    state.exitEditMode();
    state.enterEditMode("video-upload");
    state.exitEditMode();

    expect(spoken).toEqual([
      "Animation exportieren. Einstellungen festlegen und dann auf Exportieren tippen.",
      "Karte exportieren. Einstellungen festlegen und dann auf Exportieren tippen.",
      "Export geschlossen",
      "Lade ein Auftrittsvideo für diese Sequenz hoch.",
      "Upload geschlossen. Zurück zu den Videos.",
    ]);
  });
});
