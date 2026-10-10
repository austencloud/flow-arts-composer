import { describe, expect, it } from "vitest";
import {
  changelogPlainText,
  toChangelogSegments,
} from "#lib/shared/versioning/domain/utils/changelog-rich-text.js";

describe("toChangelogSegments", () => {
  it("passes plain text through as one segment", () => {
    expect(toChangelogSegments("Nothing fancy here.")).toEqual([
      { kind: "text", value: "Nothing fancy here." },
    ]);
  });

  it("parses internal links to relative hrefs", () => {
    const segments = toChangelogSegments(
      "See [Creators](https://tkaflowarts.com/creators) today."
    );
    expect(segments).toEqual([
      { kind: "text", value: "See " },
      { kind: "link", label: "Creators", href: "/creators", external: false },
      { kind: "text", value: " today." },
    ]);
  });

  it("keeps external links absolute and marks them external", () => {
    const [link] = toChangelogSegments("[docs](https://example.com/a?b=1)");
    expect(link).toEqual({
      kind: "link",
      label: "docs",
      href: "https://example.com/a?b=1",
      external: true,
    });
  });

  it("treats relative urls as internal", () => {
    const [link] = toChangelogSegments("[gallery](/browse/gallery)");
    expect(link).toMatchObject({ href: "/browse/gallery", external: false });
  });

  it("parses icon tokens and normalizes the fa- prefix", () => {
    expect(toChangelogSegments("{icon:play}")).toEqual([
      { kind: "icon", name: "fa-play" },
    ]);
    expect(toChangelogSegments("{icon:fa-rocket}")).toEqual([
      { kind: "icon", name: "fa-rocket" },
    ]);
  });

  it("handles multiple tokens in one entry", () => {
    const text =
      "The {icon:play} Play button moved — [try it](https://tkaflowarts.com/create/construct).";
    const kinds = toChangelogSegments(text).map((s) => s.kind);
    expect(kinds).toEqual(["text", "icon", "text", "link", "text"]);
  });

  it("parses **bold** runs into strong segments", () => {
    expect(
      toChangelogSegments("**Stick props.** Choose **Stick** under styles.")
    ).toEqual([
      { kind: "strong", children: [{ kind: "text", value: "Stick props." }] },
      { kind: "text", value: " Choose " },
      { kind: "strong", children: [{ kind: "text", value: "Stick" }] },
      { kind: "text", value: " under styles." },
    ]);
  });

  it("keeps links and icons working inside bold runs", () => {
    expect(
      toChangelogSegments(
        "**Open {icon:play} [Create](/create/construct)** now"
      )
    ).toEqual([
      {
        kind: "strong",
        children: [
          { kind: "text", value: "Open " },
          { kind: "icon", name: "fa-play" },
          { kind: "text", value: " " },
          {
            kind: "link",
            label: "Create",
            href: "/create/construct",
            external: false,
          },
        ],
      },
      { kind: "text", value: " now" },
    ]);
  });

  it("leaves unpaired or spaced asterisks as text", () => {
    expect(toChangelogSegments("Rate 2 ** 3 and ** loose")).toEqual([
      { kind: "text", value: "Rate 2 ** 3 and ** loose" },
    ]);
    expect(toChangelogSegments("A lone **marker")).toEqual([
      { kind: "text", value: "A lone **marker" },
    ]);
  });
});

describe("changelogPlainText", () => {
  it("flattens links to labels and drops icons", () => {
    expect(
      changelogPlainText(
        "The {icon:play} Play button is in [Construct](https://tkaflowarts.com/create/construct)."
      )
    ).toBe("The Play button is in Construct.");
  });

  it("drops bold markers", () => {
    expect(
      changelogPlainText(
        "**Stick props.** Choose **Stick** in [Props](/settings/props)."
      )
    ).toBe("Stick props. Choose Stick in Props.");
  });
});
