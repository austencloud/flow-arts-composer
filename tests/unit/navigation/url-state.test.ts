import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pushState: vi.fn(),
  replaceState: vi.fn(),
}));

const appPage = vi.hoisted(() => ({
  state: {} as App.PageState,
}));

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/navigation", () => navigation);
vi.mock("$app/state", () => ({ page: appPage }));

import {
  mutateCurrentUrl,
  removeCurrentUrlParams,
  writeUrl,
} from "#lib/shared/navigation/services/url-state.js";

/** Let every queued write settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("URL state writes", () => {
  beforeEach(async () => {
    await settle();
    vi.clearAllMocks();
    navigation.pushState.mockResolvedValue(undefined);
    navigation.replaceState.mockResolvedValue(undefined);
    appPage.state = {};
    window.history.replaceState(
      {},
      "",
      "/browse/library?fresh=123&keep=yes#result"
    );
  });

  it("preserves unrelated URL parts and existing page state", () => {
    appPage.state = { moduleId: "browse", sectionId: "library" };

    removeCurrentUrlParams(["fresh"]);

    const [destination, state] = navigation.replaceState.mock.calls[0] ?? [];
    expect(new URL(String(destination)).href).toBe(
      "http://localhost:3000/browse/library?keep=yes#result"
    );
    expect(state).toEqual({ moduleId: "browse", sectionId: "library" });
  });

  it("removes only explicitly retired page-state keys", () => {
    appPage.state = {
      moduleId: "browse",
      sectionId: "library",
      sequenceOverlay: true,
    };

    mutateCurrentUrl(
      (url) => {
        url.searchParams.delete("fresh");
      },
      { removeState: ["sequenceOverlay"] }
    );

    expect(navigation.replaceState).toHaveBeenCalledWith(expect.any(URL), {
      moduleId: "browse",
      sectionId: "library",
    });
  });

  it("pushes a merged state without erasing navigation metadata", () => {
    appPage.state = { moduleId: "create", sectionId: "construct" };

    writeUrl("?sheet=inbox", {
      mode: "push",
      state: { sheet: "inbox", urlOverlay: "sheet" },
    });

    expect(navigation.pushState).toHaveBeenCalledWith("?sheet=inbox", {
      moduleId: "create",
      sectionId: "construct",
      sheet: "inbox",
      urlOverlay: "sheet",
    });
  });

  it("does not write when neither the URL nor page state changed", () => {
    removeCurrentUrlParams(["missing"]);

    expect(navigation.pushState).not.toHaveBeenCalled();
    expect(navigation.replaceState).not.toHaveBeenCalled();
  });

  // SvelteKit 3 applies a write a few microtasks after the call. Each write
  // must build on the one before it, not on the not-yet-updated URL.
  it("keeps both changes when two writes land before history updates", async () => {
    navigation.replaceState.mockImplementation(
      async (destination: string | URL, state: App.PageState) => {
        await Promise.resolve();
        window.history.replaceState({}, "", String(destination));
        appPage.state = state;
      }
    );

    removeCurrentUrlParams(["fresh"], { state: { moduleId: "browse" } });
    mutateCurrentUrl((url) => url.searchParams.set("sheet", "inbox"), {
      state: { sheet: "inbox" },
    });

    // The second write waits for the first instead of racing it.
    expect(navigation.replaceState).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(navigation.replaceState).toHaveBeenCalledTimes(2)
    );
    await settle();

    expect(window.location.search).toBe("?keep=yes&sheet=inbox");
    expect(appPage.state).toEqual({ moduleId: "browse", sheet: "inbox" });
  });
});

describe("URL writes issued before the router is initialized", () => {
  beforeEach(async () => {
    await settle();
    vi.clearAllMocks();
    navigation.replaceState.mockResolvedValue(undefined);
    appPage.state = {};
    window.history.replaceState({}, "", "/learn/concepts/unknown");
  });

  function routerNotReadyOnce() {
    navigation.replaceState.mockRejectedValueOnce(
      new Error("Cannot call `replaceState(...)` before router is initialized")
    );
  }

  it("swallows the early failure and retries on the next task", async () => {
    routerNotReadyOnce();

    expect(() => writeUrl("/learn/concepts")).not.toThrow();
    expect(navigation.replaceState).toHaveBeenCalledTimes(1);

    await vi.waitFor(() =>
      expect(navigation.replaceState).toHaveBeenCalledTimes(2)
    );
    expect(navigation.replaceState.mock.calls[1]?.[0]).toBe("/learn/concepts");
  });

  it("drops a stale deferred write when a newer one supersedes it", async () => {
    routerNotReadyOnce();
    writeUrl("/learn/concepts");

    writeUrl("/learn/concepts/grid");

    await vi.waitFor(() =>
      expect(navigation.replaceState).toHaveBeenCalledTimes(2)
    );
    expect(navigation.replaceState.mock.calls[1]?.[0]).toBe(
      "/learn/concepts/grid"
    );
    await settle();
    expect(navigation.replaceState).toHaveBeenCalledTimes(2);
  });

  it("still reports failures that are not router-readiness", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failure = new Error("Could not serialize state");
    navigation.replaceState.mockRejectedValueOnce(failure);

    writeUrl("/learn/concepts");

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[url-state] URL write failed",
        failure
      )
    );
    consoleError.mockRestore();
  });
});
