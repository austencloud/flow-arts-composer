# Unified Panel State Persistence Pattern

This document describes the standardized approach for adding localStorage persistence to state factories in TKA-Studio.

## Overview

All panel states that should persist across page refreshes now use a unified pattern:

1. **Persistence Utility** - Generic helper for load/save operations
2. **Reactive $effect** - Automatic save-on-change using Svelte 5 runes
3. **Type-safe** - Full TypeScript support with proper typing

## Quick Start

### Basic Single Property

For a simple boolean or number property:

```typescript
import { createPersistenceHelper } from "#lib/shared/state/utils/persistent-state.js";

const myPersistence = createPersistenceHelper({
  key: "my-state-key",
  defaultValue: false, // Type is inferred as boolean
});

let myValue = $state(myPersistence.load());

$effect(() => {
  void myValue; // Track the property
  myPersistence.setupAutoSave(myValue);
});
```

### Complex Objects

For nested objects with multiple properties:

```typescript
interface MySettings {
  referenceView: "none" | "animation";
  animationSettings: {
    speed: number;
    showTrails: boolean;
  };
}

const settingsPersistence = createPersistenceHelper({
  key: "my-settings",
  defaultValue: {
    referenceView: "animation",
    animationSettings: { speed: 1.0, showTrails: true },
  } as MySettings,
});

let settings = $state<MySettings>(settingsPersistence.load());

$effect(() => {
  // Access all properties you want to track
  void settings.referenceView;
  void settings.animationSettings.speed;
  void settings.animationSettings.showTrails;

  settingsPersistence.setupAutoSave(settings);
});
```

## API Reference

### `createPersistenceHelper<T>(options: PersistenceOptions<T>)`

Creates a persistence helper for a specific state type.

**Parameters:**

- `key` - localStorage key (string)
- `defaultValue` - Default value (type T, used for type inference)

**Returns:** Object with methods:

- `load(): T` - Load from localStorage with error handling
- `save(state: T): void` - Save to localStorage
- `setupAutoSave(state: T): void` - Called from $effect for auto-save

## Patterns by State Type

### Panel Open/Close State

Used for persisting whether a panel should be open on page refresh:

```typescript
const panelPersistence = createPersistenceHelper({
  key: "tka_my_panel_open",
  defaultValue: false,
});

let isOpen = $state(panelPersistence.load());

$effect(() => {
  void isOpen;
  panelPersistence.setupAutoSave(isOpen);
});
```

### Multiple Related Properties

When you have multiple independent properties (like animation panel speed + loop):

```typescript
const speedPersistence = createPersistenceHelper({
  key: "animation_speed",
  defaultValue: 1.0,
});

const loopPersistence = createPersistenceHelper({
  key: "animation_loop",
  defaultValue: false,
});

let speed = $state(speedPersistence.load());
let loop = $state(loopPersistence.load());

$effect(() => {
  void speed;
  speedPersistence.setupAutoSave(speed);
});

$effect(() => {
  void loop;
  loopPersistence.setupAutoSave(loop);
});
```

### With Custom Load Logic (Migration)

When you need to apply migration or transformation during load:

```typescript
const settingsPersistence = createPersistenceHelper({
  key: "my_settings",
  defaultValue: DEFAULT_SETTINGS,
});

function loadSettings() {
  const loaded = settingsPersistence.load();

  // Apply migrations
  if (loaded.oldField !== undefined && loaded.newField === undefined) {
    loaded.newField = transformOldField(loaded.oldField);
  }

  return loaded;
}

let settings = $state(loadSettings());

$effect(() => {
  void settings.property1;
  void settings.property2;
  settingsPersistence.setupAutoSave(settings);
});
```

## Applied Examples in TKA-Studio

### Animation Panel (`animation-panel-state.svelte.ts`)

- Persists: `speed` (0.1 to 3.0), `shouldLoop` (boolean)
- Use: Restores playback preferences on page refresh

### Video Record Settings (`video-record-settings.svelte.ts`)

- Persists: `referenceView`, animation settings, grid settings
- Use: Saves all recording configuration across sessions

### Sequence Actions Panel (`panel-coordination-state.svelte.ts` + `SequenceActionsPanel.svelte`)

- Persists: Panel open state + editing mode (turns/transforms)
- Use: Reopens panel in same state on page refresh

### Compose Module (`compose-module-state.svelte.ts`)

- Persists: Current tab (arrange/browse), animation mode
- Use: Restores tab and playback mode on navigation

### Animation Settings (`animation-settings-state.svelte.ts`)

- Persists: BPM, loop, trail settings (with migration logic)
- Use: Global animation preferences across entire app

## Error Handling

The utility automatically handles:

- Missing localStorage (SSR/non-browser environment)
- Invalid JSON (corrupted data)
- Storage quota exceeded
- Type mismatches (uses defaults)

All errors are logged but don't break the app.

## Schema Evolution

The helper provides deep merging for evolving schemas:

```typescript
// Old saved version might be missing new fields
// Utility automatically fills in missing fields from defaults
interface Settings {
  oldField: string;
  newField: string; // Added in v0.2
  nested: {
    // Added in v0.3
    value: number;
  };
}
```

## Performance Notes

- **Synchronous load** - Called during state initialization, before components mount
- **Lazy persistence** - Only saves to localStorage when values change
- **One effect per property group** - Use separate $effects for independent properties
- **No circular saves** - Property access in $effect triggers auto-save exactly once per change

## Testing

States using this pattern are easy to test:

```typescript
// Clear all test data
localStorage.clear();

// Load with defaults
const state = createMyState();
expect(state.value).toBe(DEFAULT_VALUE);

// Persist a change
state.setValue("new value");
expect(localStorage.getItem("key")).toContain("new value");
```

## Common Mistakes to Avoid

❌ **Don't:** Call `save()` directly in setters

```typescript
// OLD PATTERN - DON'T DO THIS
setSpeed: (speed) => {
  this.speed = speed;
  saveSpeed(speed); // Manual save call - no longer needed
};
```

✅ **Do:** Let $effect handle persistence

```typescript
// NEW PATTERN - USE THIS
setSpeed: (speed) => {
  this.speed = speed; // $effect detects change and saves
};

$effect(() => {
  void this.speed;
  speedPersistence.setupAutoSave(this.speed);
});
```

❌ **Don't:** Forget to access properties in $effect

```typescript
// WRONG - won't trigger on changes
$effect(() => {
  settingsPersistence.setupAutoSave(settings);
});
```

✅ **Do:** Access all tracked properties

```typescript
// RIGHT - triggers on any property change
$effect(() => {
  void settings.prop1;
  void settings.prop2;
  void settings.nested.prop3;
  settingsPersistence.setupAutoSave(settings);
});
```

## Migration to New Pattern

When refactoring existing state with old pattern:

1. **Before:** Manual `load()`/`save()` functions + `persist()` calls in each setter
2. **Create:** `createPersistenceHelper()` instance
3. **Load:** Replace `let x = $state(loadX())` with `let x = $state(persistence.load())`
4. **Remove:** Delete manual save calls from setters
5. **Add:** Single `$effect()` with property access + `setupAutoSave()`

See commit history for refactoring examples:

- `animation-panel-state.svelte.ts`
- `compose-module-state.svelte.ts`
- `animation-settings-state.svelte.ts`
