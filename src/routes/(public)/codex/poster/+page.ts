// Override the (public) group's prerender=true: this is an in-progress dev tool
// that measures DOM at runtime, so there's nothing to bake. SSR stays on
// (inherited) - the codex render SSRs fine, same as the parent codex route.
export const prerender = false;
