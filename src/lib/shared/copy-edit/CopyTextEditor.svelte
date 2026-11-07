<!--
  The dev-only editing form of CopyText. CopyEditBar is the only importer, so
  none of this reaches a production bundle.

  The editable block's children are built by hand, not by a Svelte template. A
  person typing can delete any node in there, including the markers Svelte needs
  to update a block later, and the caret must not jump while they type. So the
  DOM is the source of truth during a focus session and is rebuilt from state
  only when the block is not focused.

  Islands render in the parking span below and their wrappers are then moved
  into the block, which keeps them live components. Deleting one in the block
  leaves its element here to put back.

  The block is display: block rather than inline, so the outline and tint are
  one rectangle and clicking beside a short last line still lands in the text.
  It never uses display: contents, which breaks contenteditable focus.
-->
<script lang="ts">
  import { placeCaret } from "./caret-offset";
  import { copyEditSession } from "./copy-edit-session.svelte";
  import {
    copyTokensFromDom,
    parseCopyText,
    serializeCopyTokens,
  } from "./copy-text-serialize";
  import type { CopyEditorProps } from "./page-copy.svelte";

  let { copy, key, islands, multiline }: CopyEditorProps = $props();

  const copyId = $derived(`${copy.file}#${key}`);
  let block = $state<HTMLElement>();
  const islandElements: HTMLElement[] = $state([]);

  const readBlock = (element: HTMLElement) =>
    serializeCopyTokens(copyTokensFromDom(element));

  function rebuild(element: HTMLElement, source: string): void {
    const used = new Set<number>();
    const nodes = parseCopyText(source, islands.length).map((token) => {
      if (token.kind === "break") return document.createElement("br");
      let node: Node;
      if (token.kind === "island" && !used.has(token.index)) {
        used.add(token.index);
        node = islandElements[token.index]!;
      } else {
        // A second {0} has no element left to move, so it shows as its text.
        node = document.createTextNode(
          token.kind === "island" ? `{${token.index}}` : token.text
        );
      }
      if (token.em) {
        const em = document.createElement("em");
        em.append(node);
        node = em;
      }
      if (token.strong) {
        const strong = document.createElement("strong");
        strong.append(node);
        node = strong;
      }
      return node;
    });
    element.replaceChildren(...nodes);
  }

  // Follows Discard, a save's hot reload and first mount. Skipped while focused
  // so the caret stays put.
  $effect(() => {
    const value = copy.text[key] ?? "";
    if (!block || islandElements.length < islands.length) return;
    if (document.activeElement !== block && readBlock(block) !== value) {
      rebuild(block, value);
    }
    // The focused block is the old one, still taking keystrokes mid-save.
    if (document.activeElement === block) return;
    const caret = copyEditSession.takeCaret(copyId);
    if (caret !== null) placeCaret(block, caret);
  });

  function oninput(event: Event): void {
    copy.text[key] = readBlock(event.currentTarget as HTMLElement);
  }

  function onblur(event: FocusEvent): void {
    const element = event.currentTarget as HTMLElement;
    const value = copy.text[key] ?? "";
    if (readBlock(element) !== value) rebuild(element, value);
  }

  function onkeydown(event: KeyboardEvent): void {
    const element = event.currentTarget as HTMLElement;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const saved = copy.saved[key] ?? "";
      copy.text[key] = saved;
      rebuild(element, saved);
      element.blur();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (multiline) document.execCommand("insertLineBreak");
      else element.blur();
    }
  }

  function onpaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text/plain") ?? "";
    const text = multiline ? pasted : pasted.replace(/\s*[\r\n]+\s*/g, " ");
    // execCommand keeps the browser's undo history, and fires input.
    document.execCommand("insertText", false, text);
  }

  // An island is not editable, so a link inside it should not fire either: a
  // stray click mid-edit must not navigate away from unsaved text.
  function stopIslandClick(event: MouseEvent): void {
    event.preventDefault();
  }
</script>

<span
  bind:this={block}
  class="copy-block"
  class:dirty={copy.dirtyKeys.includes(key)}
  contenteditable="true"
  role="textbox"
  tabindex="0"
  aria-multiline={multiline}
  aria-label="Edit text: {key}"
  data-copy-id={copyId}
  {oninput}
  {onblur}
  {onkeydown}
  {onpaste}
  ondrop={(event) => event.preventDefault()}
></span>
<span hidden>
  {#each islands as island, index}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span
      bind:this={islandElements[index]}
      data-island={index}
      contenteditable="false"
      onclick={stopIslandClick}>{@render island()}</span
    >
  {/each}
</span>

<style>
  .copy-block {
    display: block;
    min-block-size: 1lh;
    border-radius: 4px;
    outline: 1px dashed transparent;
    outline-offset: 2px;
    caret-color: currentColor;
    cursor: text;
    transition:
      outline-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .copy-block:hover {
    outline-color: var(--theme-stroke-strong);
  }

  .copy-block:focus {
    outline: 1px solid var(--theme-accent);
  }

  .dirty {
    background-color: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .copy-block {
      transition: none;
    }
  }
</style>
