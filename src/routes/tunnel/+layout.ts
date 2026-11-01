// SSR renders only the thin +page.svelte head shell; the viewer body is
// browser-gated behind a dynamic import, keeping DI/browser APIs out of SSR.
export const ssr = true;
export const prerender = false;
