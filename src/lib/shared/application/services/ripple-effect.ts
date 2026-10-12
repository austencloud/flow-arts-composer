import type { RippleOptions } from "./types";
import { motionDuration } from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";

const DEFAULT_OPTIONS: Required<RippleOptions> = {
  duration: DURATION.dramatic,
  color: "rgba(255, 255, 255, 0.3)",
  opacity: 0.3,
};

export function createRipple(
  element: HTMLElement,
  event: MouseEvent | TouchEvent,
  options: RippleOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const duration = motionDuration(opts.duration);

  const rect = element.getBoundingClientRect();
  let x: number;
  let y: number;

  if (event instanceof MouseEvent) {
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  } else {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return;
    x = touch.clientX - rect.left;
    y = touch.clientY - rect.top;
  }

  const size =
    Math.max(
      Math.sqrt(x * x + y * y),
      Math.sqrt((rect.width - x) ** 2 + y ** 2),
      Math.sqrt(x ** 2 + (rect.height - y) ** 2),
      Math.sqrt((rect.width - x) ** 2 + (rect.height - y) ** 2)
    ) * 2;

  const ripple = document.createElement("span");
  ripple.style.position = "absolute";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.borderRadius = "50%";
  ripple.style.background = opts.color;
  ripple.style.opacity = "0";
  ripple.style.transform = "translate(-50%, -50%) scale(0)";
  ripple.style.pointerEvents = "none";
  ripple.style.zIndex = "10";
  ripple.style.transition = `
    transform ${duration}ms var(--ease-standard),
    opacity ${duration}ms var(--ease-standard)
  `;

  const originalPosition = getComputedStyle(element).position;
  if (originalPosition === "static") {
    element.style.position = "relative";
  }

  element.appendChild(ripple);

  requestAnimationFrame(() => {
    ripple.style.transform = "translate(-50%, -50%) scale(1)";
    ripple.style.opacity = opts.opacity.toString();

    setTimeout(() => {
      ripple.style.opacity = "0";
    }, duration * 0.4);
  });

  setTimeout(() => {
    ripple.remove();
  }, duration);
}

export function attachRipple(
  element: HTMLElement,
  options: RippleOptions = {}
): () => void {
  const handleInteraction = (event: MouseEvent | TouchEvent) => {
    createRipple(element, event, options);
  };

  element.addEventListener("mousedown", handleInteraction as EventListener);
  element.addEventListener("touchstart", handleInteraction as EventListener, {
    passive: true,
  });

  return () => {
    element.removeEventListener(
      "mousedown",
      handleInteraction as EventListener
    );
    element.removeEventListener(
      "touchstart",
      handleInteraction as EventListener
    );
  };
}
