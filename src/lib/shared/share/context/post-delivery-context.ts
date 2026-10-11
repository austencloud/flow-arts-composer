import { getContext, setContext } from "svelte";
import type { PostDeliveryState } from "#lib/shared/share/state/post-delivery-state.svelte.js";

export interface PostDeliveryContext {
  state: PostDeliveryState;
}

const POST_DELIVERY_CONTEXT = Symbol("post-delivery");

export function setPostDeliveryContext(context: PostDeliveryContext): void {
  setContext(POST_DELIVERY_CONTEXT, context);
}

export function getPostDeliveryContext(): PostDeliveryContext {
  const context = getContext<PostDeliveryContext>(POST_DELIVERY_CONTEXT);
  if (!context) {
    throw new Error(
      "Post delivery context is missing. Render this inside PostShareSheet."
    );
  }
  return context;
}
