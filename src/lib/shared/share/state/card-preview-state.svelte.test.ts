import { render } from "vitest-browser-svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { CardPreviewState } from "./card-preview-state.svelte";

const renderCard = vi.fn();
const compositionObservers = new Set<() => void>();
const visibilityObservers = new Set<() => void>();
let visibilityState = { showTKA: true };

vi.mock("$lib/shared/share/get-sharer", () => ({
  getSharer: () => ({ getCardImageBlob: renderCard }),
}));
vi.mock("$lib/shared/share/services/card-render-options", () => ({
  buildCardRenderOptions: (
    sequence: SequenceData,
    input: { darkMode: boolean }
  ) => ({
    word: sequence.word,
    darkMode: input.darkMode,
  }),
}));
vi.mock("$lib/shared/share/state/image-composition-state.svelte", () => ({
  getImageCompositionManager: () => ({
    registerObserver: (observer: () => void) =>
      compositionObservers.add(observer),
    unregisterObserver: (observer: () => void) =>
      compositionObservers.delete(observer),
  }),
}));
vi.mock("$lib/shared/pictograph/shared/state/visibility-state.svelte", () => ({
  getVisibilityStateManager: () => ({
    getState: () => visibilityState,
    registerObserver: (observer: () => void) =>
      visibilityObservers.add(observer),
    unregisterObserver: (observer: () => void) =>
      visibilityObservers.delete(observer),
  }),
}));

import CardPreviewStateHarness from "./CardPreviewStateHarness.svelte";

function sequence(word: string): SequenceData {
  return {
    id: "same-id",
    name: word,
    word,
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

afterEach(() => {
  renderCard.mockReset();
  compositionObservers.clear();
  visibilityObservers.clear();
  visibilityState = { showTKA: true };
  vi.restoreAllMocks();
});

describe("createCardPreviewState artifact identity", () => {
  it("hides a completed A immediately when B is requested", async () => {
    const first = deferred<Blob>();
    const second = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const makeUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:a")
      .mockReturnValueOnce("blob:b");
    let state!: CardPreviewState;
    const screen = render(CardPreviewStateHarness, {
      sequence: sequence("A"),
      enabled: true,
      onState: (next) => (state = next),
    });

    await settle();
    first.resolve(new Blob(["A"]));
    await settle();
    expect(state.url).toBe("blob:a");

    await screen.rerender({
      sequence: sequence("B"),
      enabled: true,
      onState: (next) => (state = next),
    });

    expect(state.url).toBeNull();
    expect(state.blob).toBeNull();
    expect(state.renderOptions).toBeNull();
    expect(state.revision).toBeNull();
    expect(state.isPreparing).toBe(true);

    second.resolve(new Blob(["B"]));
    await settle();
    expect(state.url).toBe("blob:b");
    expect(state.renderOptions).toEqual({ word: "B", darkMode: false });
    expect(makeUrl).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("never accepts a late A render after B replaces it", async () => {
    const first = deferred<Blob>();
    const second = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:b");
    let state!: CardPreviewState;
    const screen = render(CardPreviewStateHarness, {
      sequence: sequence("A"),
      enabled: true,
      onState: (next) => (state = next),
    });

    await settle();
    await screen.rerender({
      sequence: sequence("B"),
      enabled: true,
      onState: (next) => (state = next),
    });
    first.resolve(new Blob(["late A"]));
    await settle();
    expect(state.url).toBeNull();

    second.resolve(new Blob(["B"]));
    await settle();
    expect(state.url).toBe("blob:b");
    await screen.unmount();
  });

  it("invalidates a card when settings change, resets, disables, or the request fails", async () => {
    const first = deferred<Blob>();
    const settingsRender = deferred<Blob>();
    const resetRender = deferred<Blob>();
    const failedRender = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(settingsRender.promise)
      .mockReturnValueOnce(resetRender.promise)
      .mockReturnValueOnce(failedRender.promise);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:initial")
      .mockReturnValueOnce("blob:settings")
      .mockReturnValueOnce("blob:reset");
    let state!: CardPreviewState;
    const value = sequence("A");
    const screen = render(CardPreviewStateHarness, {
      sequence: value,
      enabled: true,
      onState: (next) => (state = next),
    });

    await settle();
    first.resolve(new Blob(["initial"]));
    await settle();
    expect(state.url).toBe("blob:initial");

    visibilityState = { showTKA: false };
    for (const observer of visibilityObservers) observer();
    expect(state.url).toBeNull();
    expect(state.isPreparing).toBe(true);
    await settle();
    settingsRender.resolve(new Blob(["settings"]));
    await settle();
    expect(state.url).toBe("blob:settings");

    state.reset();
    expect(state.url).toBeNull();
    await settle();
    resetRender.resolve(new Blob(["reset"]));
    await settle();
    expect(state.url).toBe("blob:reset");

    await screen.rerender({
      sequence: value,
      enabled: false,
      onState: (next) => (state = next),
    });
    expect(state.url).toBeNull();
    expect(state.isPreparing).toBe(false);
    await screen.rerender({
      sequence: value,
      enabled: true,
      onState: (next) => (state = next),
    });
    expect(state.url).toBe("blob:reset");

    state.reset();
    await settle();
    failedRender.reject(new Error("render failed"));
    await settle();
    expect(state.url).toBeNull();
    expect(state.isPreparing).toBe(false);
    await screen.unmount();
  });

  it("rejects pending work after reset, a null request, and unmount", async () => {
    const first = deferred<Blob>();
    const reset = deferred<Blob>();
    const unmounted = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(reset.promise)
      .mockReturnValueOnce(unmounted.promise);
    const makeUrl = vi.spyOn(URL, "createObjectURL");
    let state!: CardPreviewState;
    const screen = render(CardPreviewStateHarness, {
      sequence: sequence("A"),
      enabled: true,
      onState: (next) => (state = next),
    });

    await settle();
    state.reset();
    expect(state.url).toBeNull();
    await settle();
    first.resolve(new Blob(["late before reset"]));
    await settle();
    expect(state.url).toBeNull();

    await screen.rerender({
      sequence: null,
      enabled: true,
      onState: (next) => (state = next),
    });
    reset.resolve(new Blob(["late after null"]));
    await settle();
    expect(state.url).toBeNull();
    await screen.unmount();

    const secondScreen = render(CardPreviewStateHarness, {
      sequence: sequence("B"),
      enabled: true,
      onState: (next) => (state = next),
    });
    await settle();
    await secondScreen.unmount();
    unmounted.resolve(new Blob(["late after unmount"]));
    await settle();
    expect(makeUrl).not.toHaveBeenCalled();
  });

  it("renders a new request when content changes in place despite its stable id", async () => {
    const first = deferred<Blob>();
    const changed = deferred<Blob>();
    renderCard
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(changed.promise);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:before")
      .mockReturnValueOnce("blob:after");
    let state!: CardPreviewState;
    let harness!: { setWord: (word: string) => void };
    const value = sequence("A");
    const screen = render(CardPreviewStateHarness, {
      sequence: value,
      enabled: true,
      onState: (next) => (state = next),
      onHarness: (next) => (harness = next),
    });

    await settle();
    first.resolve(new Blob(["before"]));
    await settle();
    expect(renderCard.mock.calls[0]?.[0].word).toBe("A");
    harness.setWord("B");
    expect(state.url).toBeNull();
    expect(state.blob).toBeNull();
    await settle();
    changed.resolve(new Blob(["after"]));
    await settle();
    expect(state.url).toBe("blob:after");
    expect(renderCard.mock.calls[1]?.[0].word).toBe("B");
    await screen.unmount();
  });
});
