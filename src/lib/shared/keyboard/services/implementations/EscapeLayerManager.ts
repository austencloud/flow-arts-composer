import type {
  EscapeLayerRegistration,
  EscapeLayerResult,
  IEscapeLayerManager,
} from "../contracts/IEscapeLayerManager";

/**
 * Orders every open dismissible layer by when it became active.
 *
 * Modal and drawer components still own their close behavior and focus return.
 * This manager only decides which one receives a single Escape press.
 */
export class EscapeLayerManager implements IEscapeLayerManager {
  private readonly layers: Array<{
    registration: EscapeLayerRegistration;
    dismissing: boolean;
  }> = [];

  register(layer: EscapeLayerRegistration): () => void {
    this.unregister(layer.id);
    const managedLayer = { registration: layer, dismissing: false };
    this.layers.push(managedLayer);

    return () => {
      const index = this.layers.indexOf(managedLayer);
      if (index >= 0) this.layers.splice(index, 1);
    };
  }

  unregister(id: string): void {
    const index = this.layers.findIndex(
      (layer) => layer.registration.id === id
    );
    if (index >= 0) this.layers.splice(index, 1);
  }

  hasLayer(): boolean {
    return this.layers.length > 0;
  }

  dismissTopLayer(): EscapeLayerResult {
    const layer = this.layers.at(-1);
    if (!layer) return "unhandled";
    if (layer.dismissing || !layer.registration.canDismiss()) return "blocked";

    layer.dismissing = true;
    if (layer.registration.dismiss() === "remains") layer.dismissing = false;
    return "dismissed";
  }
}
