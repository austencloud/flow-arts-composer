/**
 * The drawn card of each card clip on screen, by clip id. The titles'
 * "Land on card" asks here where a card draws its header word, since only
 * the drawing knows; nothing is measured until it asks.
 */
const layers = new Map<string, HTMLElement>();

/** Registers a card's `.choreo-layer`; the returned function lets it go. */
export function registerCardLayer(
  cardId: string,
  node: HTMLElement
): () => void {
  layers.set(cardId, node);
  return () => {
    if (layers.get(cardId) === node) layers.delete(cardId);
  };
}

/** The card's drawn layer, when it is on screen. */
export function cardLayerOf(cardId: string): HTMLElement | null {
  const node = layers.get(cardId);
  return node?.isConnected ? node : null;
}
