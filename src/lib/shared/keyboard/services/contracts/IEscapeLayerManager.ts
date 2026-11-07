export type EscapeLayerResult = "dismissed" | "blocked" | "unhandled";

export interface EscapeLayerRegistration {
  id: string;
  /** Return "remains" when the press stepped the layer back without closing
   *  it, so the next press reaches it again. */
  dismiss: () => void | "remains";
  canDismiss: () => boolean;
}

export interface IEscapeLayerManager {
  register(layer: EscapeLayerRegistration): () => void;
  unregister(id: string): void;
  hasLayer(): boolean;
  dismissTopLayer(): EscapeLayerResult;
}
