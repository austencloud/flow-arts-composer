import { describe, expect, it } from "vitest";
import {
  resolveCardLoadingPresentation,
  type CardLoadingPresentationInput,
} from "../choreo-card-loading-presentation";

const placeholder = { isLoaded: false };
const drawn = { isLoaded: true };

const firstRender: CardLoadingPresentationInput = {
  isLoading: false,
  isRefreshing: true,
  cells: [placeholder, placeholder, placeholder],
  exportPresentation: false,
  stackVisible: false,
  seenBefore: false,
  firstRenderEnded: false,
};

describe("resolveCardLoadingPresentation", () => {
  it("shows the loading state, not Updating, while a first render holds only placeholders", () => {
    expect(resolveCardLoadingPresentation(firstRender)).toEqual({
      loading: true,
      refreshing: false,
      seen: false,
    });
  });

  it("keeps loading while some cells are in but the stack is still held unseen", () => {
    // The cold scan film: the first cell reported loaded, the render was still
    // running and the stack still hidden, and "Updating" showed over nothing.
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        cells: [drawn, drawn, placeholder],
      })
    ).toEqual({ loading: true, refreshing: false, seen: false });
  });

  it("ends loading the frame the stack becomes visible with its pictures", () => {
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        isRefreshing: false,
        cells: [drawn, drawn, drawn],
        stackVisible: true,
        firstRenderEnded: true,
      })
    ).toEqual({ loading: false, refreshing: false, seen: true });
  });

  it("never shows Updating before the first render has ended", () => {
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        cells: [drawn, drawn, drawn],
        stackVisible: true,
      })
    ).toMatchObject({ loading: false, refreshing: false });
  });

  it("shows Updating, never loading, for a later redraw that briefly re-measures", () => {
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        cells: [placeholder, placeholder],
        stackVisible: false,
        seenBefore: true,
        firstRenderEnded: true,
      })
    ).toEqual({ loading: false, refreshing: true, seen: true });
  });

  it("keeps the empty-card loading state before any cell exists", () => {
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        isLoading: true,
        isRefreshing: false,
        cells: [],
        exportPresentation: true,
      })
    ).toMatchObject({ loading: true, refreshing: false });
  });

  it("treats live and failed cells as pictures", () => {
    const live = { isLoaded: false, live: {} as never };
    const failed = { isLoaded: false, renderFailed: true };
    for (const cell of [live, failed]) {
      expect(
        resolveCardLoadingPresentation({
          ...firstRender,
          isRefreshing: false,
          cells: [cell],
          stackVisible: true,
        }).loading
      ).toBe(false);
    }
  });

  it("never overlays an export presentation", () => {
    expect(
      resolveCardLoadingPresentation({
        ...firstRender,
        exportPresentation: true,
        seenBefore: true,
        firstRenderEnded: true,
      })
    ).toMatchObject({ loading: false, refreshing: false });
  });
});
