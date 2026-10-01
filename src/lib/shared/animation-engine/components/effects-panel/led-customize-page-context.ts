export type LedCustomizePage = "prop" | "pattern" | "color" | "look";

export interface LedCustomizePageState {
  current: LedCustomizePage;
}

export const LED_CUSTOMIZE_PAGE_CONTEXT = Symbol("led-customize-page");
