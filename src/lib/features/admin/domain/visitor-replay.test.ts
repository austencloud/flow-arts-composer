import { describe, expect, it } from "vitest";
import { visitorsFromNotification } from "./visitor-replay";

describe("visitorsFromNotification", () => {
  it("keeps every visitor in a burst, in arrival order", () => {
    const visitors = visitorsFromNotification({
      visits: [
        {
          place: "Lyon, France",
          source: "Google",
          device: "iPhone",
          landingPath: "/learn",
          visitNumber: 1,
          postHogSessionId: "019a1b2c-aaaa",
        },
        {
          place: "Sydney, Australia",
          source: "Instagram",
          device: "Android",
          landingPath: "/",
          visitNumber: 3,
          postHogSessionId: null,
        },
      ],
    });

    expect(visitors.map((v) => v.place)).toEqual([
      "Lyon, France",
      "Sydney, Australia",
    ]);
    expect(visitors.map((v) => v.postHogSessionId)).toEqual([
      "019a1b2c-aaaa",
      null,
    ]);
  });

  it("drops a session id that could break out of the replay URL", () => {
    const [visitor] = visitorsFromNotification({
      visits: [{ place: "Lyon", postHogSessionId: "../../evil?x=1" }],
    });
    expect(visitor?.postHogSessionId).toBeNull();
  });

  it("falls back to the top-level session id on alerts without a list", () => {
    const visitors = visitorsFromNotification({
      postHogSessionId: "019a-legacy",
    });
    expect(visitors).toHaveLength(1);
    expect(visitors[0]?.postHogSessionId).toBe("019a-legacy");
  });
});
