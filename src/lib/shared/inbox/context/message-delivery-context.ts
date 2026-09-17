import { getContext, setContext } from "svelte";
import type { MessageDeliveryState } from "../state/message-delivery-state.svelte";

const MESSAGE_DELIVERY_CONTEXT = Symbol("message-delivery-context");

/**
 * The one live outbox, reachable from outside the inbox tree.
 *
 * The inbox drawer creates the delivery state and owns its lifecycle, but a
 * send can start from a surface that is a sibling of the drawer, not a child:
 * the sequence viewer's send mode queues messages without ever opening the
 * drawer. Svelte context cannot cross that boundary, so the drawer also
 * registers its instance here.
 */
let registeredDelivery: MessageDeliveryState | null = null;
const listeners = new Set<(state: MessageDeliveryState | null) => void>();

function publish(): void {
  for (const listener of listeners) listener(registeredDelivery);
}

export function setMessageDeliveryContext(state: MessageDeliveryState): void {
  setContext(MESSAGE_DELIVERY_CONTEXT, state);
  registeredDelivery = state;
  publish();
}

/** The drawer's teardown; only the instance it registered is withdrawn. */
export function unregisterMessageDeliveryState(
  state: MessageDeliveryState
): void {
  if (registeredDelivery !== state) return;
  registeredDelivery = null;
  publish();
}

/**
 * Hosts mount the drawer lazily, so a surface can be up before the outbox
 * is. The listener runs on every register and withdraw; returns the
 * unsubscribe.
 */
export function onMessageDeliveryRegistered(
  listener: (state: MessageDeliveryState | null) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Context first, the registered outbox second: the shared picker renders
 * conversation rows inside the viewer's send mode too, where the drawer is a
 * sibling and its context cannot reach.
 */
export function getMessageDeliveryContext(): MessageDeliveryState {
  const state =
    getContext<MessageDeliveryState | undefined>(MESSAGE_DELIVERY_CONTEXT) ??
    registeredDelivery;
  if (!state) {
    throw new Error("Message delivery context is not available.");
  }
  return state;
}

/**
 * For surfaces outside the inbox drawer. Null until the drawer has mounted;
 * `inboxState.requestHost()` asks a lazy host to mount it.
 */
export function getRegisteredMessageDeliveryState(): MessageDeliveryState | null {
  return registeredDelivery;
}
