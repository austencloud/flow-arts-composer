export const DURATION = {
  /** 100ms - Micro-feedback (hover states, toggles) */
  instant: 100,
  /** 150ms - Quick UI responses (buttons, inputs) */
  fast: 150,
  /** 200ms - Standard transitions (panels, tabs) */
  normal: 200,
  /** 280ms - Emphasized changes (module switches) */
  emphasis: 280,
  /** 350ms - Major transitions (drawers, modals) */
  dramatic: 350,
  /** 800ms - A whole scene moving, such as the /composer stage gliding
      between sections. Never for a control or panel. */
  scene: 800,
} as const;

export const STAGGER = {
  /** 30ms - Tight sequences (list items) */
  micro: 30,
  /** 50ms - Standard sequences (cards) */
  normal: 50,
  /** 80ms - Spread out (major sections) */
  relaxed: 80,
} as const;

export const SLIDE = {
  /** 8px - Subtle slides (tabs) */
  sm: 8,
  /** 12px - Standard slides (cards, panels) */
  md: 12,
  /** 20px - Prominent slides (modals) */
  lg: 20,
} as const;

/** @deprecated Use SLIDE instead */
export const SLIDE_DISTANCE = SLIDE;
