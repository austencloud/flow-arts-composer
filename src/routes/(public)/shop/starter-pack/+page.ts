// Rendered per request, not prerendered: the page carries live catalog data
// (price, preorder state, box contents), and a build-time render could only
// ever capture the loading state.
export const prerender = false;
export const ssr = true;
