import { guardInternalRoute } from "../../config/build-flags";
import type { LayoutLoad } from "./$types";

// /test/* are dev-only scratch harnesses with no SEO. Production empties their
// components, so this guard sends a production visitor to the gallery instead
// of a blank page. A harness layout must never reset past this file
// (`+layout@.svelte`): the reset drops the guard and ssr = false with it, and
// tests/unit/ssr-emptied-routes.test.ts fails when one does.
//
// Inheriting the root ssr=true means every navigation triggers a full SvelteKit
// SSR render in the dev process; when several agents are pegging CPU with
// check/build, that render queues behind them and the document hangs blank on
// "Loading..." forever. ssr=false returns the shell instantly and renders
// client-side instead.
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = () => {
  guardInternalRoute();
  return {};
};
