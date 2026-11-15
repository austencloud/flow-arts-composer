/**
 * Whether a wall of pieces should name the maker under each tile. When one
 * person made every piece on the wall, their name repeated under all of them
 * says nothing; the name earns its place only once makers differ. The piece
 * page always names the maker.
 */
export function wallShowsMakerNames(
  pieces: readonly { readonly ownerId: string }[]
): boolean {
  const first = pieces[0];
  if (!first) return false;
  return pieces.some((piece) => piece.ownerId !== first.ownerId);
}
