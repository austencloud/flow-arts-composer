// $app/navigation stub for the render-parity project. Unlike the shared
// tests/setup/stubs stub, `preloadData` resolves to a loaded result for the
// render pipeline's import graph (scan-attribution, module-state).
export const goto = () => Promise.resolve();
export const invalidate = () => Promise.resolve();
export const invalidateAll = () => Promise.resolve();
export const refreshAll = () => Promise.resolve();
export const prefetchRoutes = () => Promise.resolve();
export const beforeNavigate = () => {};
export const afterNavigate = () => {};
export const onNavigate = () => {};
export const pushState = () => Promise.resolve();
export const replaceState = () => Promise.resolve();
export const disableScrollHandling = () => {};
export const preloadData = () =>
  Promise.resolve({ type: "loaded" as const, status: 200, data: {} });
export const preloadCode = () => Promise.resolve();
