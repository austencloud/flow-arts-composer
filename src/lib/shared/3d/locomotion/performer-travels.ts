/**
 * Whether a travel state means this performer walks at all. The locomotion
 * pack (about twenty clips) and the per-frame foot planter are only worth
 * loading for a performer who leaves their spot; a card sequence performed in
 * place never needs them.
 */
export function travelMeansWalking(travel: {
  moving: boolean;
  speed: number;
}): boolean {
  return travel.moving || travel.speed !== 0;
}
