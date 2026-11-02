/**
 * Menu builders write bare `fa-*` names (the context menu adds the style
 * class); other lists write the full class. The tile and chip views of a
 * menu's items draw both as the solid style.
 */
export function menuItemIconClass(icon: string | undefined): string {
  if (!icon) return "";
  return /\bfa[srb]\b|\bfa-(solid|regular|brands)\b/.test(icon)
    ? icon
    : `fas ${icon}`;
}
