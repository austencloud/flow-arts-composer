// `$app/server` only works inside a built SvelteKit server, and SvelteKit's
// own module refuses to load under Vitest ("invalid import"). src/hooks.server.ts
// imports it, so every test that imports the hook needs this stand-in. Tests
// that exercise read() or the request accessor mock this module themselves.
export function read(asset: string): Response {
  throw new Error(`read(${asset}) needs a SvelteKit server; mock $app/server`);
}

export function getRequestEvent(): never {
  throw new Error("getRequestEvent() has no request outside a SvelteKit server");
}
