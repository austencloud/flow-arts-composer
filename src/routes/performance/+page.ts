// Performance transfer (Museum / Flow Fest import) is not release ready, so
// production sends visitors away; the build also empties this page.
import { guardInternalRoute } from "../../config/build-flags";
import type { PageLoad } from "./$types";

export const ssr = false;
export const prerender = false;

export const load: PageLoad = () => {
  guardInternalRoute();
  return {};
};
