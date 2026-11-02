/**
 * SvelteKit's `$app/state` for the script-tag build: the host page's own
 * address, and never a navigation in flight, since the host owns its routing.
 */
export const page = {
  get url(): URL {
    return new URL(window.location.href);
  },
  state: {} as Record<string, unknown>,
};

export const navigating = {
  from: null,
  to: null,
  type: null,
  willUnload: null,
  delta: null,
  complete: null,
};
