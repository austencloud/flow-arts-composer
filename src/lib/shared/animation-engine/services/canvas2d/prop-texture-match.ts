/**
 * Whether the sprite the image loader holds for a hand is the one the current
 * frame describes.
 *
 * The loader is fed render keys (`fan__lotus`, `club__model`) while frame
 * params carry the notation prop type (`fan`, `club`), so the two can never be
 * compared directly. A hand matches when the loaded key is the key most
 * recently requested (no load in flight) and the notation prop behind that
 * key is the one the frame describes (the params have not already moved on
 * to an incoming prop the manager has yet to request).
 */
export function propTextureMatchesRequest(args: {
  loaded: string | null | undefined;
  requested: string | null | undefined;
  paramsPropType: string | null | undefined;
}): boolean {
  const loaded = args.loaded?.toLowerCase();
  if (!loaded) return false;
  if (loaded !== args.requested?.toLowerCase()) return false;
  const paramsType = args.paramsPropType?.toLowerCase();
  if (paramsType == null) return true;
  return basePropTypeOfRenderKey(loaded) === paramsType;
}

function basePropTypeOfRenderKey(key: string): string {
  const separator = key.indexOf("__");
  return separator === -1 ? key : key.slice(0, separator);
}
