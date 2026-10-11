import { describe, expect, it, vi } from "vitest";

// Each route is one call into @austencloud/phone-sign-in; the package's own
// tests cover what the handlers do. These check that every route reaches the
// handler meant for it, with the request and the event's context.
const handlers = vi.hoisted(() => {
  const names = [
    "create",
    "lookup",
    "decision",
    "collect",
    "auto",
    "notMe",
    "trust",
    "stopTrusting",
  ] as const;
  return Object.fromEntries(
    names.map((name) => [name, vi.fn(async () => new Response(name))])
  ) as Record<(typeof names)[number], ReturnType<typeof vi.fn>>;
});
vi.mock("#lib/server/auth/phone-sign-in.js", () => ({
  phoneSignIn: handlers,
  routeContext: (event: { params: { id?: string } }) => ({
    id: event.params.id,
    clientAddress: "203.0.113.9",
  }),
}));

const ID = "AbCdEfGhIjKlMnOpQr12";
const API = "../../../src/routes/api/phone-sign-in";

type Route = (event: never) => Response | Promise<Response>;
const routes: [string, keyof typeof handlers, () => Promise<Route>][] = [
  [
    "POST /api/phone-sign-in",
    "create",
    async () => (await import(`${API}/+server.js`)).POST,
  ],
  [
    "GET /api/phone-sign-in/[id]",
    "lookup",
    async () => (await import(`${API}/[id]/+server.js`)).GET,
  ],
  [
    "POST /api/phone-sign-in/[id]/decision",
    "decision",
    async () => (await import(`${API}/[id]/decision/+server.js`)).POST,
  ],
  [
    "POST /api/phone-sign-in/[id]/collect",
    "collect",
    async () => (await import(`${API}/[id]/collect/+server.js`)).POST,
  ],
  [
    "POST /api/phone-sign-in/[id]/auto",
    "auto",
    async () => (await import(`${API}/[id]/auto/+server.js`)).POST,
  ],
  [
    "POST /api/phone-sign-in/[id]/not-me",
    "notMe",
    async () => (await import(`${API}/[id]/not-me/+server.js`)).POST,
  ],
  [
    "POST /api/phone-sign-in/trusted-phone",
    "trust",
    async () => (await import(`${API}/trusted-phone/+server.js`)).POST,
  ],
  [
    "DELETE /api/phone-sign-in/trusted-phone",
    "stopTrusting",
    async () => (await import(`${API}/trusted-phone/+server.js`)).DELETE,
  ],
];

describe("phone sign-in routes", () => {
  it.each(routes)("%s calls %s", async (_route, name, load) => {
    const route = await load();
    const request = new Request(
      `https://tkaflowarts.com/api/phone-sign-in/${ID}`,
      { method: "POST" }
    );
    const event = {
      request,
      params: { id: ID },
      url: new URL(request.url),
      getClientAddress: () => "203.0.113.9",
    };

    const response = await route(event as never);

    expect(await response.text()).toBe(name);
    expect(handlers[name]).toHaveBeenCalledWith(request, {
      id: ID,
      clientAddress: "203.0.113.9",
    });
  });
});
