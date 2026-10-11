import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ dev: false }));

// Vitest loads vite.config.ts, so the `define` map inlines __FEATURE_COVEN__ as
// `true` under NODE_ENV=test. Mocking the reader is what makes the disabled
// branch reachable at all — see src/config/build-flags.ts.
// Partial mock: only the Coven constant is stubbed. guardInternalRoute stays
// real so the per-route tests below exercise the shipping redirect, not a fake.
const isCovenBuildEnabled = vi.fn<() => boolean>();
vi.mock("../../src/config/build-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/config/build-flags")>()),
  isCovenBuildEnabled: () => isCovenBuildEnabled(),
}));

afterEach(() => {
  isCovenBuildEnabled.mockReset();
});

// Static imports (vi.mock is hoisted, so the mocks above still apply). A
// templated dynamic import can't be statically analyzed by Vite and resolves
// inconsistently for route files.
import * as devLayout from "../../src/routes/(dev)/+layout";
import * as demoLayout from "../../src/routes/demo/+layout";
import * as grantFeaturePage from "../../src/routes/grant-feature/+page";
import * as renderPictographsPage from "../../src/routes/render-pictographs/+page";
import * as hallOfShamePage from "../../src/routes/hall-of-shame/+page";
import * as authLabPage from "../../src/routes/(public)/composer/auth-lab/+page";
import * as retro1989Page from "../../src/routes/1989/+page";
import * as retro1995Layout from "../../src/routes/1995/+layout";
import * as retro1998Page from "../../src/routes/1998/+page";
import * as retro2003Page from "../../src/routes/2003/+page";

function expectBrowseRedirect(run: () => unknown): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({
    status: 307,
    location: "/browse/gallery",
  });
}

describe("internal route production guards", () => {
  it("redirects direct Coven navigation when its build flag is off", async () => {
    isCovenBuildEnabled.mockReturnValue(false);
    const { load } = await import("../../src/routes/coven/+page");

    expectBrowseRedirect(() => load({} as never));
  });

  it("serves Coven when its build flag is on", async () => {
    isCovenBuildEnabled.mockReturnValue(true);
    const { load } = await import("../../src/routes/coven/+page");

    expect(load({} as never)).toEqual({});
  });

  it("redirects direct test-route navigation outside the dev server", async () => {
    const { load } = await import("../../src/routes/test/+layout");

    expectBrowseRedirect(() => load({} as never));
  });

  // Emptying a route component without a guard leaves a blank page at a live
  // URL, which is worse than shipping the page. Every guarded pattern must
  // therefore own a load function that redirects.
  it.each([
    ["(dev) group", devLayout],
    ["demo", demoLayout],
    ["grant-feature", grantFeaturePage],
    ["render-pictographs", renderPictographsPage],
    ["hall-of-shame", hallOfShamePage],
    ["composer/auth-lab", authLabPage],
    ["1989", retro1989Page],
    ["1995", retro1995Layout],
    ["1998", retro1998Page],
    ["2003", retro2003Page],
  ])("redirects %s in a production build", (_name, mod) => {
    expectBrowseRedirect(() => mod.load({} as never));
  });
});
