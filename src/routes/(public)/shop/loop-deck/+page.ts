// The whole configurator renders server-side, seeded with the catalog snapshot
// from +page.server.ts, so crawlers and the first paint get the real product
// page: title, price, packs, how-it-works copy, and the cross-sell rail. The
// card art, the live fan, and the dials hydrate in the browser; nothing in the
// configurator touches canvas or Firebase until its effects run there.
export const ssr = true;
export const prerender = false;
