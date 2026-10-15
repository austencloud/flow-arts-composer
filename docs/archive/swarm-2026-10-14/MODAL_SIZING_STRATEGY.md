# Bulletproof Modal Sizing Strategy

## Implementation Status (Jan 2026)

**Partially implemented.** The three-layer system and layout mode detection are documented but not all modals follow this pattern yet. Some modals still use hardcoded sizes. This document serves as the target architecture.

---

## Core Principles

1. **Content-first, viewport-constrained**: Modal sizes to its content, but never exceeds safe viewport bounds
2. **Height-aware**: Unlike most modal systems, we consider BOTH width AND height for layout decisions
3. **No hardcoded max-widths**: Use viewport percentages with intelligent fallbacks
4. **Layout mode switching**: Automatically adapt between compact/expanded based on available space

---

## The Three-Layer System

### Layer 1: Safe Viewport Bounds (CSS Variables)

```css
:root {
  /* Safe area = viewport minus breathing room */
  --modal-safe-width: calc(100vw - var(--modal-edge-margin, 32px));
  --modal-safe-height: calc(100dvh - var(--modal-edge-margin, 32px));

  /* Edge margin scales down on mobile */
  --modal-edge-margin: clamp(16px, 4vw, 48px);
}
```

### Layer 2: Content-Driven Sizing

Modal width/height is determined by content, using `width: fit-content` and `max-width/max-height` constraints:

```css
.modal {
  width: fit-content;
  max-width: var(--modal-safe-width);

  height: fit-content;
  max-height: var(--modal-safe-height);
}
```

### Layer 3: Layout Mode Detection

Before rendering, determine the layout mode based on what the content NEEDS vs what's AVAILABLE:

```typescript
type LayoutMode = 'compact' | 'comfortable' | 'spacious';

function determineLayoutMode(
  contentNeeds: { minWidth: number; minHeight: number; idealWidth: number; idealHeight: number },
  viewport: { width: number; height: number }
): LayoutMode {
  const safeWidth = viewport.width - 32; // edge margin
  const safeHeight = viewport.height - 32;

  // Can we fit the ideal layout?
  if (safeWidth >= contentNeeds.idealWidth && safeHeight >= contentNeeds.idealHeight) {
    return 'spacious';
  }

  // Can we fit comfortably with some compromise?
  if (safeWidth >= contentNeeds.minWidth * 1.2 && safeHeight >= contentNeeds.minHeight * 1.2) {
    return 'comfortable';
  }

  // Compact mode - minimize everything
  return 'compact';
}
```

---

## Implementation Pattern for Complex Modals

### Step 1: Define Content Requirements

```typescript
const CONTENT_REQUIREMENTS = {
  // Single panel (e.g., just "Choose Photo")
  singlePanel: { minWidth: 320, minHeight: 400, idealWidth: 400, idealHeight: 500 },

  // Side-by-side panels (e.g., "Choose Photo" + "Create Avatar")
  dualPanel: { minWidth: 600, minHeight: 500, idealWidth: 800, idealHeight: 600 },

  // Stacked panels (vertical arrangement)
  stackedPanel: { minWidth: 360, minHeight: 700, idealWidth: 420, idealHeight: 800 },
};
```

### Step 2: Choose Layout Based on Viewport

```typescript
function chooseLayout(viewport: { width: number; height: number }) {
  const safeWidth = viewport.width - 32;
  const safeHeight = viewport.height - 32;

  // Preference order: dual > stacked > single (tabbed)

  // Can we do side-by-side?
  if (safeWidth >= CONTENT_REQUIREMENTS.dualPanel.minWidth &&
      safeHeight >= CONTENT_REQUIREMENTS.dualPanel.minHeight) {
    return 'dual';
  }

  // Can we stack vertically?
  if (safeWidth >= CONTENT_REQUIREMENTS.stackedPanel.minWidth &&
      safeHeight >= CONTENT_REQUIREMENTS.stackedPanel.minHeight) {
    return 'stacked';
  }

  // Fall back to tabbed (one panel at a time)
  return 'tabbed';
}
```

### Step 3: Apply Appropriate Styles

```svelte
<script>
  const layout = $derived(chooseLayout({
    width: window.innerWidth,
    height: window.innerHeight
  }));
</script>

<dialog class="modal" data-layout={layout}>
  {#if layout === 'dual'}
    <div class="dual-panel-container">
      <PanelA />
      <div class="divider"></div>
      <PanelB />
    </div>
  {:else if layout === 'stacked'}
    <div class="stacked-container">
      <PanelA />
      <PanelB />
    </div>
  {:else}
    <TabSwitcher>
      <Tab><PanelA /></Tab>
      <Tab><PanelB /></Tab>
    </TabSwitcher>
  {/if}
</dialog>
```

### Step 4: CSS for Each Layout

```css
.modal {
  /* Base: content-driven with viewport constraints */
  width: fit-content;
  max-width: var(--modal-safe-width);
  height: fit-content;
  max-height: var(--modal-safe-height);
  overflow: hidden; /* Prevent modal itself from scrolling */
}

/* Dual panel layout */
.modal[data-layout="dual"] .dual-panel-container {
  display: flex;
  gap: var(--spacing-lg);
}

.modal[data-layout="dual"] .panel {
  flex: 1;
  min-width: 280px;
}

/* Stacked layout */
.modal[data-layout="stacked"] .stacked-container {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* Tabbed layout - most compact */
.modal[data-layout="tabbed"] {
  width: min(var(--modal-safe-width), 360px);
}
```

---

## Scrolling Strategy

**Rule: Only scroll CONTENT, never the modal shell.**

```css
.modal {
  overflow: hidden; /* Shell never scrolls */
}

.modal-body {
  overflow-y: auto; /* Content area scrolls if needed */
  max-height: calc(var(--modal-safe-height) - var(--modal-header-height) - var(--modal-footer-height));
}
```

For panels with their own scroll needs:

```css
.panel-content {
  overflow-y: auto;
  flex: 1;
  min-height: 0; /* Required for flex overflow */
}
```

---

## Reusable Mixin/Utility

Create a reusable function for any modal:

```typescript
// src/lib/shared/modals/utils/modal-layout.ts

export interface ContentRequirements {
  minWidth: number;
  minHeight: number;
  idealWidth?: number;
  idealHeight?: number;
}

export interface LayoutConfig {
  layouts: {
    name: string;
    requirements: ContentRequirements;
    priority: number; // Higher = preferred
  }[];
}

export function selectBestLayout(
  config: LayoutConfig,
  viewport: { width: number; height: number }
): string {
  const edgeMargin = Math.min(48, Math.max(16, viewport.width * 0.04));
  const safeWidth = viewport.width - edgeMargin * 2;
  const safeHeight = viewport.height - edgeMargin * 2;

  // Sort by priority (highest first)
  const sorted = [...config.layouts].sort((a, b) => b.priority - a.priority);

  // Find first layout that fits
  for (const layout of sorted) {
    if (safeWidth >= layout.requirements.minWidth &&
        safeHeight >= layout.requirements.minHeight) {
      return layout.name;
    }
  }

  // Fallback to lowest priority (should always fit)
  return sorted[sorted.length - 1].name;
}
```

---

## ProfilePhotoPicker Specific Application

```typescript
const PHOTO_PICKER_LAYOUTS: LayoutConfig = {
  layouts: [
    {
      name: 'side-by-side',
      requirements: { minWidth: 640, minHeight: 480 },
      priority: 3,
    },
    {
      name: 'stacked',
      requirements: { minWidth: 360, minHeight: 600 },
      priority: 2,
    },
    {
      name: 'tabbed',
      requirements: { minWidth: 280, minHeight: 400 },
      priority: 1,
    },
  ],
};
```

---

## Testing Checklist

Before shipping any modal, verify at these breakpoints:

- [ ] 320×568 (iPhone SE)
- [ ] 375×667 (iPhone 8)
- [ ] 390×844 (iPhone 14)
- [ ] 768×1024 (iPad portrait)
- [ ] 1024×768 (iPad landscape)
- [ ] 1280×720 (small laptop)
- [ ] 1920×1080 (standard desktop)
- [ ] 2560×1440 (QHD)
- [ ] 3840×2160 (4K)

At each size, verify:
- [ ] No horizontal scrollbar on modal
- [ ] No vertical scrollbar on modal shell (content scroll OK)
- [ ] All interactive elements visible without scrolling (or clearly indicated)
- [ ] Layout mode is appropriate for the space
- [ ] Content is readable (no squished text)
