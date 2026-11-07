/**
 * Saving rewrites copy.json and Vite re-creates the page, so the block being
 * typed in is replaced by a new one. These carry the caret across as a count of
 * characters from the start of the block, so typing can simply carry on.
 */

export function caretOffset(block: HTMLElement): number | null {
  const selection = getSelection();
  if (!selection?.rangeCount || !selection.anchorNode) return null;
  if (!block.contains(selection.anchorNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

export function placeCaret(block: HTMLElement, offset: number): void {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.collapse(false);

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (remaining <= node.length) {
      // An island can't hold a caret, so a caret just after one sits outside it.
      const island = node.parentElement?.closest("[data-island]");
      if (island) range.setStartAfter(island);
      else range.setStart(node, remaining);
      range.collapse(true);
      break;
    }
    remaining -= node.length;
  }

  block.focus();
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
