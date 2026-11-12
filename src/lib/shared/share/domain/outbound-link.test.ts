import { describe, expect, it } from "vitest";
import { tagOutboundLink } from "./outbound-link";

describe("tagOutboundLink", () => {
  it("tags a sequence link and keeps its own parameters", () => {
    const tagged = new URL(
      tagOutboundLink(
        "https://tkaflowarts.com/sequence/Ab12?pane=animation",
        "copy_link"
      )
    );

    expect(tagged.pathname).toBe("/sequence/Ab12");
    expect(tagged.searchParams.get("pane")).toBe("animation");
    expect(tagged.searchParams.get("utm_source")).toBe("app_share");
    expect(tagged.searchParams.get("utm_medium")).toBe("copy_link");
    expect(tagged.searchParams.get("utm_campaign")).toBe("sequence_share");
  });

  // The scan path is what printed cards encode; it must reach the redirect
  // worker and /q/ byte for byte.
  it("leaves scan links and other sites exactly as they were", () => {
    for (const url of [
      "HTTPS://TKA.RUN/A1F8",
      "https://tka.run/A1F8?bp=S",
      "https://tkaflowarts.com/q/A1F8",
      "https://www.instagram.com/tkaflowarts/",
      "not a url",
    ]) {
      expect(tagOutboundLink(url, "share_sheet")).toBe(url);
    }
  });

  it("re-credits a link that arrived tagged to this share", () => {
    const tagged = new URL(
      tagOutboundLink(
        "https://tkaflowarts.com/sequence/Ab12?utm_source=instagram&utm_medium=social",
        "share_sheet"
      )
    );

    expect(tagged.searchParams.getAll("utm_source")).toEqual(["app_share"]);
    expect(tagged.searchParams.get("utm_medium")).toBe("share_sheet");
  });
});
