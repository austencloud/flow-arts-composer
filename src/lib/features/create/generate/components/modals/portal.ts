/**
 * Portal utility for rendering modals at document.body level
 * This ensures modals appear above all other content regardless of stacking context
 */

import { onMount } from "svelte";

/**
 * Action to mount an element directly to document.body, or to the host given.
 * Usage: <div use:portal>...</div>, <div use:portal={appOverlayLayer()}>
 */
export function portal(node: HTMLElement, host: HTMLElement = document.body) {
  host.appendChild(node);

  return {
    destroy() {
      // Clean up when component unmounts
      if (node.parentNode === host) {
        host.removeChild(node);
      }
    },
  };
}

/**
 * The layer the app's own drawers and modals stack in (the app shell, marked
 * `data-overlay-layer`), or <body> on a page without the shell. The shell is
 * a stacking context, so the z-index scale in `shared/ui/z-index.ts` orders
 * things only among what is inside it. A panel portaled to <body> at the
 * drawer tier painted over every modal in the shell, including a sign-in box
 * the panel itself had asked for. Portal there instead when an app modal may
 * open over the panel.
 */
export function appOverlayLayer(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("[data-overlay-layer]") ?? document.body
  );
}

/**
 * Hook to use in modal components for proper portal rendering
 */
export function useModalPortal() {
  let portalTarget: HTMLElement | undefined;

  onMount(() => {
    // Create a container at body level
    portalTarget = document.createElement("div");
    portalTarget.className = "modal-portal";
    document.body.appendChild(portalTarget);

    return () => {
      // Cleanup
      if (portalTarget && document.body.contains(portalTarget)) {
        document.body.removeChild(portalTarget);
      }
    };
  });

  return {
    get portalTarget() {
      return portalTarget;
    },
  };
}
