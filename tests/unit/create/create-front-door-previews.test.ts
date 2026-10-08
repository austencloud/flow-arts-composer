// @vitest-environment jsdom

/**
 * The Create front door's cards host live previews of their methods. Every
 * card reserves its stage, the previews mount when the board first opens,
 * the cards take turns once the page settles, and choosing a method or
 * closing the board ends the turns. Names, order, and analytics stay as
 * they were. Spec:
 * docs/superpowers/specs/2026-10-06-create-method-previews-design.md
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Section } from "$lib/shared/navigation/domain/types";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import { METHOD_PREVIEW_SCENES } from "$lib/features/create/shared/components/method-previews/method-preview-scenes";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";

const analytics = vi.hoisted(() => ({
  logCreateFrontDoorViewed: vi.fn(),
  logCreateMethodSelected: vi.fn(),
}));

vi.mock(
  "$lib/features/create/shared/services/create-entry-analytics",
  () => analytics
);
vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));
// The real preview box loads scene modules jsdom cannot draw. The stand-in
// reports ready on mount and shows the props it was given.
vi.mock(
  "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte",
  async () => ({
    default: (await import("./FakeMethodPreview.svelte")).default,
  })
);

const { default: FrontDoorHost } = await import("./FrontDoorHost.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/** Every method, in board order. */
const ALL = [
  "construct",
  "generate",
  "shape-engine",
  "fuse",
  "tunnel",
  "assemble",
];
const WITH_SCENES = ALL.filter((id) =>
  Object.hasOwn(METHOD_PREVIEW_SCENES, id)
);

/** runAfterNamedRouteMorphIdle waits this long without requestIdleCallback, as in jsdom. */
const IDLE_FALLBACK_MS = 180;
const FIRST_TURN_MS = IDLE_FALLBACK_MS + METHOD_PREVIEW_TIMING.startDelayMs;
const TURN_CYCLE_MS =
  METHOD_PREVIEW_TIMING.turnMs + METHOD_PREVIEW_TIMING.gapMs;

function methodsFor(ids: string[]): Section[] {
  return ids.map((id) => {
    const tab = CREATE_TABS.find((candidate) => candidate.id === id);
    if (!tab) throw new Error(`Unknown Create tab ${id}`);
    return tab;
  });
}

describe("Create front door, method previews", () => {
  let host: HTMLElement;
  let frontDoor: ReturnType<typeof mount> | null = null;
  let stubbedCreateElement: typeof document.createElement;
  const onSelect = vi.fn();
  const onLockedSelect = vi.fn();

  function render({
    methods = methodsFor(ALL),
    locked = [],
    lastUsedMode = null,
  }: {
    methods?: Section[];
    locked?: string[];
    lastUsedMode?: string | null;
  } = {}): void {
    frontDoor = mount(FrontDoorHost, {
      target: host,
      props: {
        methods,
        lockedMethodIds: new Set(locked),
        lastUsedMode,
        onSelect,
        onLockedSelect,
      },
    });
    flushSync();
  }

  /** CreateModule shows and hides the board through its `active` prop. */
  function setOpen(open: boolean): void {
    frontDoor?.setActive(open);
    flushSync();
  }

  /** Run the clock, then let the DOM catch up with the turns it moved. */
  function advance(ms: number): void {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  function playingMethod(): string | null {
    return (
      host
        .querySelector(".method-index")
        ?.getAttribute("data-playing-method") ?? null
    );
  }

  function card(methodId: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-method-id="${methodId}"]`
    );
    if (!button) throw new Error(`No card for ${methodId}`);
    return button;
  }

  function preview(methodId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(
      `.fake-preview[data-method="${methodId}"]`
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    host = document.createElement("div");
    document.body.append(host);
    onSelect.mockReset();
    onLockedSelect.mockReset();
    analytics.logCreateFrontDoorViewed.mockReset();
    analytics.logCreateMethodSelected.mockReset();
  });

  afterEach(() => {
    if (frontDoor) unmount(frontDoor);
    frontDoor = null;
    host.remove();
    document.createElement = stubbedCreateElement;
    delete document.documentElement.dataset.motionPreference;
    vi.useRealTimers();
  });

  it("reserves a stage in every card and mounts the previews when the board first opens", () => {
    render();

    expect(host.querySelectorAll(".method-stage")).toHaveLength(ALL.length);
    expect(host.querySelector(".fake-preview")).toBeNull();

    setOpen(true);

    expect(WITH_SCENES.length).toBeGreaterThan(0);
    const previews = [...host.querySelectorAll<HTMLElement>(".fake-preview")];
    expect(previews.map((element) => element.dataset.method)).toEqual(
      WITH_SCENES
    );
    for (const element of previews) {
      const tab = CREATE_TABS.find(
        (candidate) => candidate.id === element.dataset.method
      );
      expect(element.dataset.color).toBe(tab?.color);
    }
  });

  it("keeps each card one button named by its words", () => {
    render();
    setOpen(true);

    for (const id of ALL) {
      const button = card(id);
      const stage = button.querySelector(".method-stage");
      expect(stage?.getAttribute("aria-hidden")).toBe("true");
      expect(stage?.textContent?.trim()).toBe("");
      expect(
        stage?.querySelector("a, button, input, select, textarea, [tabindex]")
      ).toBeNull();
      const tab = CREATE_TABS.find((candidate) => candidate.id === id);
      expect(button.querySelector(".method-name")?.textContent?.trim()).toBe(
        t(tab?.labelKey ?? "")
      );
      expect(button.getAttribute("aria-label")).toBeNull();
    }
    for (const id of WITH_SCENES) {
      expect(
        card(id)
          .querySelector(".method-name .method-glyph")
          ?.getAttribute("aria-hidden")
      ).toBe("true");
    }
  });

  it("starts the turns in board order once the page has settled", () => {
    render();
    setOpen(true);

    advance(FIRST_TURN_MS - 1);
    expect(playingMethod()).toBeNull();

    advance(1);
    expect(playingMethod()).toBe("construct");
    expect(preview("construct")?.dataset.playing).toBe("true");

    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
    expect(preview("construct")?.dataset.playing).toBe("false");
  });

  it("ends the turns when a method is chosen", () => {
    render();
    setOpen(true);
    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");

    card("generate").click();
    flushSync();

    expect(onSelect).toHaveBeenCalledWith("generate");
    expect(playingMethod()).toBeNull();
    advance(TURN_CYCLE_MS * 3);
    expect(playingMethod()).toBeNull();
  });

  it("keeps the turns going when a guest taps a locked method", () => {
    render({ locked: ["fuse"] });
    setOpen(true);
    advance(FIRST_TURN_MS);

    card("fuse").click();
    flushSync();

    expect(onLockedSelect).toHaveBeenCalledWith("fuse");
    expect(onSelect).not.toHaveBeenCalled();
    expect(playingMethod()).toBe("construct");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
  });

  it("shows every finished picture and plays nothing under reduced motion", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    render();
    setOpen(true);

    expect(host.querySelectorAll(".fake-preview")).toHaveLength(
      WITH_SCENES.length
    );
    advance(FIRST_TURN_MS + TURN_CYCLE_MS * 2);
    expect(playingMethod()).toBeNull();
  });

  it("ends the turns when the board closes and starts over when it opens again", () => {
    render();
    setOpen(true);
    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");

    setOpen(false);
    expect(playingMethod()).toBeNull();
    // The previews stay mounted behind the workspace.
    expect(host.querySelectorAll(".fake-preview")).toHaveLength(
      WITH_SCENES.length
    );
    advance(TURN_CYCLE_MS * 2);
    expect(playingMethod()).toBeNull();

    setOpen(true);
    advance(FIRST_TURN_MS - 1);
    expect(playingMethod()).toBeNull();
    advance(1);
    expect(playingMethod()).toBe("construct");
  });

  it("reports the view once and the choice as before", () => {
    render({ lastUsedMode: "generate" });
    setOpen(true);
    advance(FIRST_TURN_MS);

    expect(analytics.logCreateFrontDoorViewed).toHaveBeenCalledTimes(1);
    expect(analytics.logCreateFrontDoorViewed).toHaveBeenCalledWith({
      source: "direct",
      methodCount: ALL.length,
    });

    card("generate").click();

    expect(analytics.logCreateMethodSelected).toHaveBeenCalledWith({
      method: "generate",
      source: "direct",
      isLastUsed: true,
      isLocked: false,
    });
  });

  it("keeps the icon box, and skips the turn, for a method without a scene", () => {
    const [construct] = methodsFor(["construct"]);
    if (!construct) throw new Error("No Construct tab");
    render({
      methods: [
        ...methodsFor(["construct", "generate"]),
        { ...construct, id: "sketch" },
      ],
    });
    setOpen(true);

    const sketch = card("sketch");
    expect(sketch.querySelector(".method-stage .method-icon")).not.toBeNull();
    expect(sketch.querySelector(".method-glyph")).toBeNull();
    expect(preview("sketch")).toBeNull();

    advance(FIRST_TURN_MS);
    expect(playingMethod()).toBe("construct");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("generate");
    advance(TURN_CYCLE_MS);
    expect(playingMethod()).toBe("construct");
  });
});
