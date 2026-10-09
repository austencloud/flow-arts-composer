/**
 * Props whose Version 2 (captured model sprite) was retired. Simple Staff and
 * Capped Staff draw the same Staff3D model as the plain staff, and Fire
 * Staff's notation art is drawn from its model's own measurements, so a
 * capture of any of them duplicates a look the picker already offers. The
 * sprite capture page never queues them, even with ?force=1, and its save
 * endpoint refuses them.
 */
export const RETIRED_MODEL_SPRITE_PROPS: ReadonlySet<string> = new Set([
  "simple_staff",
  "staff_v2",
  "fire_double_staff",
]);

export function isRetiredModelSprite(prop: string): boolean {
  return RETIRED_MODEL_SPRITE_PROPS.has(prop.toLowerCase());
}
