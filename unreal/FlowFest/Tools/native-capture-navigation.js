/** Navigation is unavailable in the standalone motion capture page. */
const unsupported = () => {
  throw new Error("Navigation was invoked during native motion capture");
};
export const goto = unsupported;
export const preloadData = unsupported;
export const preloadCode = unsupported;
export const afterNavigate = unsupported;
export const beforeNavigate = unsupported;
export const onNavigate = unsupported;
export const pushState = unsupported;
export const replaceState = unsupported;
export const invalidate = unsupported;
export const invalidateAll = unsupported;
