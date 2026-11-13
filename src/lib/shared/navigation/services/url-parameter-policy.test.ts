import { describe, it, expect } from "vitest";
import {
  pruneParamsForNavigation,
  pruneRouteScopedParams,
} from "./url-parameter-policy";

const at = (href: string) => new URL(href, "https://tkaflowarts.com");

describe("viewer-state params are scoped to an open viewer", () => {
  it("drops orphan viewer state left on a browse route", () => {
    // The reported dead link: it names a pane and a tunnel grid but no
    // sequence, so it can only ever open the plain gallery.
    const url = at(
      '/browse/explore/sequences?pane=animation&s=raw:{"sv":1,"tn":{"gridVisible":true}}'
    );
    pruneRouteScopedParams(url, "/browse/explore/sequences");

    expect(url.searchParams.get("pane")).toBeNull();
    expect(url.searchParams.get("s")).toBeNull();
    expect(url.search).toBe("");
  });

  it("keeps viewer state on a browse route while identity is present", () => {
    const url = at("/browse/explore/sequences?v=EHWE&pane=animation&fx=fire");
    pruneRouteScopedParams(url, "/browse/explore/sequences");

    expect(url.searchParams.get("v")).toBe("EHWE");
    expect(url.searchParams.get("pane")).toBe("animation");
    expect(url.searchParams.get("fx")).toBe("fire");
  });

  it("keeps viewer state on the viewer's own route without ?v=", () => {
    const url = at(
      "/sequence/EHWE?pane=split&split=animation,card&cols=4&s=d1:abc"
    );
    pruneRouteScopedParams(url, "/sequence/EHWE");

    expect(url.searchParams.get("pane")).toBe("split");
    expect(url.searchParams.get("split")).toBe("animation,card");
    expect(url.searchParams.get("cols")).toBe("4");
    expect(url.searchParams.get("s")).toBe("d1:abc");
  });

  it("keeps viewer state on the spiroanim viewer route", () => {
    const url = at("/from/spiroanim/abc?pane=animation");
    pruneRouteScopedParams(url, "/from/spiroanim/abc");

    expect(url.searchParams.get("pane")).toBe("animation");
  });

  it("strips orphan viewer state as a path change carries the query across", () => {
    // navigation-coordinator and browse-navigation-state both rewrite only the
    // pathname and hand the whole query string to the destination.
    const url = at("/browse/explore/sequences?pane=animation&fx=fire&s=d1:abc");
    pruneParamsForNavigation(url, "/browse/explore/collections");

    expect(url.search).toBe("");
  });

  it("leaves unrelated route-scoped behavior intact", () => {
    const url = at("/atlas?letter=A&grid=diamond&pane=animation");
    pruneRouteScopedParams(url, "/atlas");

    expect(url.searchParams.get("letter")).toBe("A");
    expect(url.searchParams.get("grid")).toBe("diamond");
    expect(url.searchParams.get("pane")).toBeNull();
  });

  it("keeps the letter explorer's state on the Codex page", () => {
    for (const path of ["/codex", "/de/codex", "/guide/codex"]) {
      const url = at(`${path}?letter=B&grid=box&variation=2&leftTurns=1`);
      pruneRouteScopedParams(url, path);

      expect(url.searchParams.get("letter")).toBe("B");
      expect(url.searchParams.get("grid")).toBe("box");
      expect(url.searchParams.get("variation")).toBe("2");
      expect(url.searchParams.get("leftTurns")).toBe("1");
    }

    const print = at("/codex/print?letter=B");
    pruneRouteScopedParams(print, "/codex/print");
    expect(print.searchParams.get("letter")).toBeNull();
  });
});

describe("the By mandala address belongs to the Sequences screen", () => {
  it("keeps the level on Sequences and drops the old family page's row", () => {
    const url = at("/browse/explore/sequences?mandala=3&seq=s1");
    pruneRouteScopedParams(url, "/browse/explore/sequences");

    expect(url.searchParams.get("mandala")).toBe("3");
    expect(url.searchParams.has("seq")).toBe(false);
  });

  it("drops both when Browse moves to another screen", () => {
    // Every Browse move copies the query string; the place must not ride
    // along onto Collections and reopen when he comes back.
    const url = at("/browse/explore/collections?mandala=3&seq=s1");
    pruneParamsForNavigation(url, "/browse/explore/collections");

    expect(url.searchParams.has("mandala")).toBe(false);
    expect(url.searchParams.has("seq")).toBe(false);
  });

  it("leaves seq alone on pages that own it", () => {
    const url = at("/coven?seq=s1");
    pruneRouteScopedParams(url, "/coven");

    expect(url.searchParams.get("seq")).toBe("s1");
  });
});
