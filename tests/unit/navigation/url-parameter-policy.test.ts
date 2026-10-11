import { describe, expect, it } from "vitest";
import {
  pruneParamsForNavigation,
  pruneRouteScopedParams,
} from "#lib/shared/navigation/services/url-parameter-policy.js";

describe("route-scoped URL parameters", () => {
  it("drops recovery and source-route state on module navigation", () => {
    const url = new URL(
      "https://tkaflowarts.com/browse/library/item?fresh=1&scan=1&handoff=abc&keep=yes"
    );

    pruneParamsForNavigation(url, "/create/construct");

    expect(url.search).toBe("?keep=yes");
  });

  it("keeps parameters on their owning route", () => {
    const scanUrl = new URL(
      "https://tkaflowarts.com/browse/library/item?scan=1"
    );
    const museumUrl = new URL("https://tkaflowarts.com/museum?room=lascaux");

    pruneParamsForNavigation(scanUrl, scanUrl.pathname);
    pruneParamsForNavigation(museumUrl, museumUrl.pathname);

    expect(scanUrl.search).toBe("?scan=1");
    expect(museumUrl.search).toBe("?room=lascaux");
  });

  it("keeps a festival pack only on its deck-releaser route", () => {
    const releaserUrl = new URL(
      "https://tkaflowarts.com/choreo_card/releaser?pack=festival-sampler-2026"
    );
    const generateUrl = new URL(
      "https://tkaflowarts.com/create/generate?pack=festival-sampler-2026"
    );

    pruneRouteScopedParams(releaserUrl, releaserUrl.pathname);
    pruneRouteScopedParams(generateUrl, generateUrl.pathname);

    expect(releaserUrl.search).toBe("?pack=festival-sampler-2026");
    expect(generateUrl.search).toBe("");
  });

  it("keeps a theme link only on the Theme page", () => {
    const themeUrl = new URL(
      "https://tkaflowarts.com/settings/theme?theme=autumn"
    );
    const profileUrl = new URL(
      "https://tkaflowarts.com/settings/profile?theme=autumn"
    );

    pruneRouteScopedParams(themeUrl, themeUrl.pathname);
    pruneRouteScopedParams(profileUrl, profileUrl.pathname);

    expect(themeUrl.search).toBe("?theme=autumn");
    expect(profileUrl.search).toBe("");
  });

  it("keeps letter state only on its Atlas and Gallery destinations", () => {
    const atlasUrl = new URL(
      "https://tkaflowarts.com/atlas?letter=B&grid=box&variation=6&leftTurns=0.5"
    );
    const galleryUrl = new URL(
      "https://tkaflowarts.com/browse/explore/sequences?letter=B"
    );
    const legacyAtlasUrl = new URL(
      "https://tkaflowarts.com/glossary?letter=B&grid=diamond&variation=2&blueTurns=0.5"
    );
    const unrelatedUrl = new URL(
      "https://tkaflowarts.com/create/construct?letter=B&grid=box&variation=6"
    );

    pruneRouteScopedParams(atlasUrl, atlasUrl.pathname);
    pruneRouteScopedParams(galleryUrl, galleryUrl.pathname);
    pruneRouteScopedParams(legacyAtlasUrl, legacyAtlasUrl.pathname);
    pruneRouteScopedParams(unrelatedUrl, unrelatedUrl.pathname);

    expect(atlasUrl.search).toBe(
      "?letter=B&grid=box&variation=6&leftTurns=0.5"
    );
    expect(galleryUrl.search).toBe("?letter=B");
    expect(legacyAtlasUrl.search).toBe(
      "?letter=B&grid=diamond&variation=2&blueTurns=0.5"
    );
    expect(unrelatedUrl.search).toBe("");
  });
});
