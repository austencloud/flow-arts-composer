/**
 * The player's chosen prop colours as the colour names the Shape Engine's
 * styles already read: `--prop-blue*` and `--prop-red*` for the left and right
 * hand, and `--dm-motion-*` for motion marks. The site-wide theme defines
 * those names off `--user-left-color` / `--user-right-color`, which nothing
 * sets, so without this every red and blue in the engine stays the default
 * however the player recoloured their props.
 *
 * The site theme also mixes washes and the "both" colour from the defaults
 * once, at the page root, so those are mixed again here from the chosen pair.
 *
 * Set it on the engine's root, and again inside anything portalled out of it
 * (popovers), since custom properties only reach their own descendants.
 * Returns undefined when the player kept the default colours.
 */
export function propInkStyle(
  colors: { left: string; right: string } | null | undefined
): string | undefined {
  if (!colors) return undefined;
  const hand = (name: "blue" | "red", color: string) =>
    `--prop-${name}:${color};` +
    `--prop-${name}-text:${color};` +
    `--prop-${name}-bg:color-mix(in srgb, ${color} 15%, transparent);` +
    `--prop-${name}-border:color-mix(in srgb, ${color} 40%, transparent);` +
    `--dm-motion-${name}:${color};`;
  const wash = (a: string, b: string) =>
    `linear-gradient(135deg, color-mix(in srgb, ${a}) 0%, color-mix(in srgb, ${b}) 100%)`;
  const { left, right } = colors;
  return (
    hand("blue", left) +
    hand("red", right) +
    `--dm-motion-both:color-mix(in srgb, ${left} 50%, ${right});` +
    `--dm-motion-blue-wash:${wash(`${left} 30%, transparent`, `${left} 16%, transparent`)};` +
    `--dm-motion-red-wash:${wash(`${right} 16%, transparent`, `${right} 30%, transparent`)};` +
    `--dm-motion-both-wash:${wash(`${left} 30%, transparent`, `${right} 30%, transparent`)};`
  );
}
