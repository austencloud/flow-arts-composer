/**
 * The Create tabs whose Play runs the quick preview in place of the card.
 * Assemble's Play opens the full viewer instead, and Fuse, Tunnel and Shape
 * own their whole workspace, so a preview left running there would have
 * nowhere to go once the save view closes.
 */
export function playsInWorkspace(tab: string | null | undefined): boolean {
  return tab === "construct" || tab === "generate";
}
