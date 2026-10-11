import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  goto: vi.fn(),
}));

const appPage = vi.hoisted(() => ({
  url: new URL("http://localhost:3000/"),
  state: {} as App.PageState,
}));

const appNavigating = vi.hoisted(() => ({
  complete: null as Promise<void> | null,
  willUnload: null as boolean | null,
}));

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/navigation", () => navigation);
vi.mock("$app/state", () => ({ page: appPage, navigating: appNavigating }));

import {
  mutateCurrentUrl,
  removeCurrentUrlParams,
  writeUrl,
} from "#lib/shared/navigation/services/url-state.js";

/** Let every queued write settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

function shallow(replace: boolean, state: App.PageState) {
  return { shallow: true, replace, state };
}

/** Puts both the address bar and SvelteKit's page on `path`. */
function openPage(path: string) {
  window.history.replaceState({}, "", path);
  appPage.url = new URL(path, "http://localhost:3000");
}

/** A real navigation in progress, settled by the returned callbacks. */
function startNavigation({ willUnload = false } = {}) {
  let finish!: () => void;
  let abort!: () => void;
  const complete = new Promise<void>((resolve, reject) => {
    finish = resolve;
    abort = () => reject(new Error("navigation aborted"));
  });
  appNavigating.complete = complete;
  appNavigating.willUnload = willUnload;
  const end = () => {
    appNavigating.complete = null;
    appNavigating.willUnload = null;
  };
  return {
    arrive(path: string) {
      openPage(path);
      finish();
      end();
    },
    fail() {
      abort();
      end();
    },
  };
}

beforeEach(async () => {
  await settle();
  vi.clearAllMocks();
  navigation.goto.mockResolvedValue(undefined);
  appNavigating.complete = null;
  appNavigating.willUnload = null;
  appPage.state = {};
});

describe("URL state writes", () => {
  beforeEach(() => {
    openPage("/browse/library?fresh=123&keep=yes#result");
  });

  it("preserves unrelated URL parts and existing page state", () => {
    appPage.state = { moduleId: "browse", sectionId: "library" };

    removeCurrentUrlParams(["fresh"]);

    const [destination, options] = navigation.goto.mock.calls[0] ?? [];
    expect(new URL(String(destination)).href).toBe(
      "http://localhost:3000/browse/library?keep=yes#result"
    );
    expect(options).toEqual(
      shallow(true, { moduleId: "browse", sectionId: "library" })
    );
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

    expect(navigation.goto).toHaveBeenCalledWith(
      expect.any(URL),
      shallow(true, { moduleId: "browse", sectionId: "library" })
    );
  });

  it("pushes a merged state without erasing navigation metadata", () => {
    appPage.state = { moduleId: "create", sectionId: "construct" };

    writeUrl("?sheet=inbox", {
      mode: "push",
      state: { sheet: "inbox", urlOverlay: "sheet" },
    });

    expect(navigation.goto).toHaveBeenCalledWith(
      "?sheet=inbox",
      shallow(false, {
        moduleId: "create",
        sectionId: "construct",
        sheet: "inbox",
        urlOverlay: "sheet",
      })
    );
  });

  it("does not write when neither the URL nor page state changed", () => {
    removeCurrentUrlParams(["missing"]);

    expect(navigation.goto).not.toHaveBeenCalled();
  });

  // SvelteKit 3 applies a write a few microtasks after the call. Each write
  // must build on the one before it, not on the not-yet-updated URL.
  it("keeps both changes when two writes land before history updates", async () => {
    navigation.goto.mockImplementation(
      async (destination: string | URL, options: { state: App.PageState }) => {
        await Promise.resolve();
        window.history.replaceState({}, "", String(destination));
        appPage.state = options.state;
      }
    );

    removeCurrentUrlParams(["fresh"], { state: { moduleId: "browse" } });
    mutateCurrentUrl((url) => url.searchParams.set("sheet", "inbox"), {
      state: { sheet: "inbox" },
    });

    // The second write waits for the first instead of racing it.
    expect(navigation.goto).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigation.goto).toHaveBeenCalledTimes(2));
    await settle();

    expect(window.location.search).toBe("?keep=yes&sheet=inbox");
    expect(appPage.state).toEqual({ moduleId: "browse", sheet: "inbox" });
  });
});

// A shallow `goto` takes over SvelteKit's navigation, so a write that landed
// while a link's page was still loading would cancel the link.
describe("URL writes made while a navigation is loading", () => {
  beforeEach(() => {
    openPage("/create/construct?sheet=inbox");
  });

  it("waits, then lands when the navigation leaves the page in place", async () => {
    const pageLoad = startNavigation();

    removeCurrentUrlParams(["sheet"]);
    await settle();
    expect(navigation.goto).not.toHaveBeenCalled();

    pageLoad.fail();
    await vi.waitFor(() => expect(navigation.goto).toHaveBeenCalledTimes(1));
    expect(String(navigation.goto.mock.calls[0]?.[0])).toBe(
      "http://localhost:3000/create/construct"
    );
  });

  it("drops the write once the navigation replaces its page", async () => {
    const pageLoad = startNavigation();
    removeCurrentUrlParams(["sheet"]);

    pageLoad.arrive("/browse/library?view=grid");
    // Made while the old write still waits, this one starts from the new
    // page's address rather than building on the old page's pending URL.
    mutateCurrentUrl((url) => url.searchParams.set("sort", "new"));

    await vi.waitFor(() => expect(navigation.goto).toHaveBeenCalledTimes(1));
    expect(String(navigation.goto.mock.calls[0]?.[0])).toBe(
      "http://localhost:3000/browse/library?view=grid&sort=new"
    );
    await settle();
    expect(navigation.goto).toHaveBeenCalledTimes(1);
  });

  it("drops the write when the navigation leaves the app", async () => {
    startNavigation({ willUnload: true });

    removeCurrentUrlParams(["sheet"]);
    await settle();

    expect(navigation.goto).not.toHaveBeenCalled();
  });
});

describe("URL writes issued before the router is initialized", () => {
  beforeEach(() => {
    openPage("/learn/concepts/unknown");
  });

  function routerNotReadyOnce() {
    navigation.goto.mockRejectedValueOnce(
      new Error("Cannot call `goto(...)` before router is initialized")
    );
  }

  it("swallows the early failure and retries on the next task", async () => {
    routerNotReadyOnce();

    expect(() => writeUrl("/learn/concepts")).not.toThrow();
    expect(navigation.goto).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(navigation.goto).toHaveBeenCalledTimes(2));
    expect(navigation.goto.mock.calls[1]?.[0]).toBe("/learn/concepts");
  });

  it("drops a stale deferred write when a newer one supersedes it", async () => {
    routerNotReadyOnce();
    writeUrl("/learn/concepts");

    writeUrl("/learn/concepts/grid");

    await vi.waitFor(() => expect(navigation.goto).toHaveBeenCalledTimes(2));
    expect(navigation.goto.mock.calls[1]?.[0]).toBe("/learn/concepts/grid");
    await settle();
    expect(navigation.goto).toHaveBeenCalledTimes(2);
  });

  it("still reports failures that are not router-readiness", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const failure = new Error("Could not serialize state");
    navigation.goto.mockRejectedValueOnce(failure);

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
