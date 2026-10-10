import { describe, expect, it } from "vitest";
import {
  buildScanAppHandoffHref,
  buildScanAppHandoffPath,
} from "#lib/shared/qr/services/scan-app-handoff.js";

function handoffDestination(path: string): URL {
  const bridge = new URL(path, "https://tkaflowarts.com");
  return new URL(
    bridge.searchParams.get("to") ?? "/",
    "https://tkaflowarts.com"
  );
}

describe("scan app handoff", () => {
  it("opens the scanned sequence with its prop and physical-card identity", () => {
    const target = handoffDestination(
      buildScanAppHandoffPath(
        "CLUB42",
        new URLSearchParams("bp=club&rp=club&pid=23456789ABCD")
      )
    );

    expect(target.pathname).toBe("/browse/gallery");
    expect(target.searchParams.get("v")).toBe("CLUB42");
    expect(target.searchParams.get("code")).toBe("CLUB42");
    expect(target.searchParams.get("from")).toBe("scan");
    expect(target.searchParams.get("bp")).toBe("club");
    expect(target.searchParams.get("rp")).toBe("club");
    expect(target.searchParams.get("pid")).toBe("23456789ABCD");
  });

  it("does not carry the embedded demo marker into the app", () => {
    const target = handoffDestination(
      buildScanAppHandoffPath(
        "DEMO42",
        new URLSearchParams("demo=1&bp=staff&rp=staff")
      )
    );

    expect(target.searchParams.has("demo")).toBe(false);
  });

  it("package-pins the Android handoff while leaving desktop on the web bridge", () => {
    const params = new URLSearchParams("bp=club&rp=club");
    const androidHref = buildScanAppHandoffHref("CLUB42", params, {
      android: true,
      origin: "https://tkaflowarts.com",
    });
    const webHref = buildScanAppHandoffHref("CLUB42", params, {
      android: false,
      origin: "https://tkaflowarts.com",
    });

    expect(androidHref).toContain("intent://tkaflowarts.com/store/open?to=");
    expect(androidHref).toContain("package=com.tkaflowarts.composer");
    expect(decodeURIComponent(androidHref)).toContain(
      "/browse/gallery?bp=club&rp=club&from=scan&code=CLUB42&v=CLUB42"
    );
    expect(webHref).toMatch(/^\/store\/open\?to=/);
  });
});
