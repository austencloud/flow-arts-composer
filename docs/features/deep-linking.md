# Deep Linking System

**Repository status (2026-10-14):** Current encoder APIs live in `src/lib/shared/navigation/services/sequence-encoder.ts`; the sequence model stores performed `steps` separately from `startPlacement`. Follow [URL state ownership](../architecture/url-state.md) and [route evidence](../architecture/browse-route-evidence-manifest.md). The old utility/store, integration snippets and wire examples below are historical; current `URLSyncer` is `src/lib/shared/navigation/services/url-syncer.ts`.

## Overview

The Deep Linking system allows users to create shareable URLs that open Flow Arts Composer with a specific sequence pre-loaded in any module (Create, Animate, or Browse). This enables easy sharing of sequences without requiring database storage.

## How It Works

### Live URL Sync

`URLSyncer` writes an inline `open` payload for callers using `syncURLWithSequence`; that behavior is scoped to those callers and options. `/sequence` and `/q` can resolve identifiers or prepared artifacts, so a complete inline sequence is not guaranteed in every URL.

**Example workflow:**

1. Create a sequence in Constructor
2. URL automatically becomes: `?open=construct:1|soweiic0p:...`
3. Edit beats → URL updates (debounced, every 500ms)
4. **Just copy the URL bar and share!** ✨

### URL Format

```
https://your-app.com/?open=<module>:<encoded-sequence>
```

**Examples:**

- `?open=construct:1|soweiic0p:soweiuc0p|...`
- `?open=animate:1|soweiic0p:soweiuc0p|...`
- `?open=construct:z:N4IgdghgtgpiBc...` (compressed)

**Typical lengths:**

- 16 beats: ~150-180 chars
- 32 beats: ~250-300 chars
- 64 beats: ~450-550 chars

### Supported Modules

| Module Shorthand             | Full Module ID | Target Tab    | Description                            |
| ---------------------------- | -------------- | ------------- | -------------------------------------- |
| `construct` or `constructor` | `create`       | `constructor` | Opens Constructor tab in Create module |
| `assemble` or `assembler`    | `create`       | `assembler`   | Opens Assembler tab in Create module   |
| `generate` or `generator`    | `create`       | `generator`   | Opens Generator tab in Create module   |
| `animate` or `single`        | `animate`      | `single`      | Opens Single mode in Animate module    |
| `tunnel`                     | `animate`      | `tunnel`      | Opens Tunnel mode in Animate module    |
| `mirror`                     | `animate`      | `mirror`      | Opens Mirror mode in Animate module    |
| `grid`                       | `animate`      | `grid`        | Opens Grid mode in Animate module      |
| `browse` or `gallery`        | `browse`       | `gallery`     | Opens Gallery in Browse module         |

## Historical encoding examples

### Compact Encoding Format

**Structure:**

```
beatNumber|beat1|beat2|beat3|...
```

**Each beat:**

```
blueMotion:redMotion
```

**Each motion:**

```
startLoc(2) + endLoc(2) + startOrient(1) + endOrient(1) + rotDir(1) + turns(1+) + type(1)
```

### Character Codes

**Locations (2 chars):**

- `no` = North
- `ea` = East
- `so` = South
- `we` = West
- `ne` = Northeast
- `se` = Southeast
- `sw` = Southwest
- `nw` = Northwest

**Orientations (1 char):**

- `i` = In
- `o` = Out
- `k` = Clock
- `t` = Counter

**Rotation Directions (1 char):**

- `c` = Clockwise
- `u` = Counter-clockwise
- `x` = No rotation

**Motion Types (1 char):**

- `p` = Pro
- `a` = Anti
- `l` = Float (lowercase L)
- `d` = Dash
- `s` = Static

**Turns:**

- `0-9` = Number of turns
- `f` = Float (variable turns)

### Example Encoding

**Motion:** South → West, In → In, Clockwise, 0 turns, Pro

```
soweiic0p
```

**Beat:** Blue motion + Red motion

```
soweiic0p:soweiuc0p
```

**Full Sequence (2 beats):**

```
1|soweiic0p:soweiuc0p|wesouuc0p:nosouuc0p
```

### Compression

For longer sequences, LZString compression is automatically applied when beneficial:

**Uncompressed:**

```
?open=construct:1|soweiic0p:soweiuc0p|...
```

**Compressed (prefixed with `z:`):**

```
?open=construct:z:N4IgdghgtgpiBcIDCAzABgewE4GcBOALgJ4BOA7gK4CuAngDQhgCW+A9vtTbY1QC...
```

Compression typically saves 60-70% for sequences with 5+ beats.

## Usage in Code

### Generating Share URLs

```typescript
import { generateShareURL } from "#lib/shared/navigation/services/sequence-encoder.js";

// In your component
const currentSequence = sequenceState.currentSequence;

if (currentSequence) {
  const result = generateShareURL(currentSequence, "construct", {
    compress: true,
  });

  console.log("Share URL:", result.url);
  console.log("Length:", result.length);
  console.log("Compressed:", result.compressed);
  console.log("Savings:", result.savings + "%");

  // Copy to clipboard
  navigator.clipboard.writeText(result.url);
}
```

### Parsing Deep Links

Deep links are automatically parsed on app initialization. The system:

1. **Parses URL** - Extracts the `open` parameter
2. **Decodes sequence** - Decompresses and reconstructs SequenceData
3. **Navigates** - Switches to target module and tab
4. **Loads sequence** - Injects sequence into module state
5. **Cleans URL** - Removes the `open` parameter

### Manual Parsing

```typescript
import { parseDeepLink } from "#lib/shared/navigation/services/sequence-encoder.js";

const result = parseDeepLink(window.location.search);

if (result) {
  console.log("Module:", result.module);
  console.log("Sequence:", result.sequence);
  // Sequence is fully reconstructed SequenceData
}
```

### Checking URL Length

```typescript
import { estimateURLLength } from "#lib/shared/navigation/services/sequence-encoder.js";

const length = estimateURLLength(sequence, "construct", true); // with compression

if (length > 1500) {
  console.warn("URL is very long, may not work in all browsers");
}
```

## Historical integration points

### 1. MainInterface.svelte

Deep links are initialized on app mount:

```typescript
import { initializeDeepLinks } from "./navigation/utils/deep-link-init";

onMount(() => {
  initializeDeepLinks();
  // ...
});
```

### 2. CreateModule.svelte

Create module consumes deep links on mount:

```typescript
import { deepLinkStore } from "$shared/navigation/utils/deep-link-store.svelte";

const deepLinkData = deepLinkStore.consume("create");
if (deepLinkData && CreateModuleState) {
  CreateModuleState.sequenceState.setCurrentSequence(deepLinkData.sequence);
  // Navigate to tab if specified
  if (deepLinkData.tabId) {
    navigationState.setActiveTab(deepLinkData.tabId);
  }
}
```

### 3. AnimateTab.svelte

Compose module consumes deep links similarly:

```typescript
const deepLinkData = deepLinkStore.consume("compose");
if (deepLinkData) {
  composeState.setPrimarySequence(deepLinkData.sequence);
  if (deepLinkData.tabId) {
    composeState.setCurrentMode(deepLinkData.tabId as ComposeMode);
  }
}
```

## Architecture

### Historical Deep Link Store

`deepLinkStore` is a reactive Svelte store that temporarily holds deep link data:

- **Set once** by `initializeDeepLinks()` on app load
- **Consumed once** by the target module on mount
- **Auto-expires** after 5 seconds to prevent stale data

This decouples URL parsing from module-specific loading logic.

### Flow Diagram

**Opening a shared link:**

```
User opens URL with ?open=construct:encoded_sequence
              ↓
      MainInterface.svelte onMount
              ↓
      initializeDeepLinks()
              ↓
   Parse URL → Decode sequence → Store in deepLinkStore
              ↓
   Navigate to 'create' module, 'constructor' tab
              ↓
   CreateModule.svelte mounts
              ↓
   Consume from deepLinkStore → Load sequence
              ↓
   Live URL sync keeps URL up-to-date (no clearing!)
```

**Editing a sequence:**

```
User edits sequence in CreateModule
              ↓
   CreateModuleState.currentSequence changes
              ↓
   $effect detects change
              ↓
   syncURLWithSequence() called (debounced 500ms)
              ↓
   URL updates via history.replaceState
              ↓
   User can copy URL bar anytime to share!
```

## Browser Compatibility

### URL Length Limits

- **Chrome/Edge**: ~32,000 characters (practical limit ~2,000)
- **Firefox**: ~65,000 characters (practical limit ~2,000)
- **Safari**: ~80,000 characters (practical limit ~2,000)
- **Internet Browser**: 2,083 characters (legacy)

**Recommendation:** Keep URLs under 1,500 characters for best compatibility.

### Sequence Length Estimates

With compression:

- **5 beats**: ~60-80 characters
- **10 beats**: ~100-120 characters
- **20 beats**: ~180-220 characters
- **50 beats**: ~400-500 characters

Without compression:

- **5 beats**: ~200-250 characters
- **10 beats**: ~400-500 characters
- **20 beats**: ~800-1000 characters

## Security Considerations

1. **No server storage** - Sequences are not stored server-side
2. **Client-side validation** - All decoded data is validated before use
3. **URL sanitization** - Special characters are URL-encoded
4. **No code execution** - Pure data encoding, no eval or script injection

## Future Enhancements

- **QR Code Generation** - Generate QR codes for easy mobile sharing
- **Short URL Service** - Optional backend service for ultra-short URLs
- **Share Analytics** - Track how many times a sequence is shared/opened
- **Social Media Cards** - Generate preview cards for social sharing
- **Email/SMS Integration** - One-click sharing via email or text

## Troubleshooting

### URL Too Long

**Problem:** URL exceeds browser limits

**Solutions:**

1. Enable compression: `generateShareURL(sequence, module, { compress: true })`
2. Reduce sequence length
3. Use a URL shortening service

### Sequence Not Loading

**Problem:** Deep link doesn't load the sequence

**Check:**

1. Console logs for errors
2. URL format is correct
3. Sequence data is valid
4. Module and tab IDs are recognized

**Debug:**

```typescript
import { parseDeepLink } from "#lib/shared/navigation/services/sequence-encoder.js";

const result = parseDeepLink(window.location.search);
console.log("Deep link result:", result);
```

### Compression Not Working

**Problem:** Compressed URLs are same length or longer

**Explanation:** LZString compression only helps with repetitive data. Short sequences (1-3 beats) may not benefit.

**Solution:** Compression is automatically skipped when it doesn't reduce size.

## Live URL Sync API

### syncURLWithSequence()

```typescript
function syncURLWithSequence(
  sequence: SequenceData | null,
  module: string,
  options?: {
    debounce?: number; // Milliseconds to debounce (default: 500)
    immediate?: boolean; // Skip debouncing
  }
): void;
```

Updates the browser URL to reflect the current sequence. Uses `history.replaceState` to avoid filling browser history.

**Example:**

```typescript
import { syncURLWithSequence } from "#lib/shared/navigation/services/sequence-encoder.js";

// Sync URL with current sequence (debounced)
syncURLWithSequence(currentSequence, "construct", { debounce: 500 });

// Immediate update (no debounce)
syncURLWithSequence(currentSequence, "construct", { immediate: true });

// Clear sequence from URL
syncURLWithSequence(null, "construct");
```

### clearSequenceFromURL()

```typescript
function clearSequenceFromURL(): void;
```

Removes sequence data from the URL, reverting to a clean URL.

### hasSequenceInURL()

```typescript
function hasSequenceInURL(): boolean;
```

Checks if the current URL contains sequence data.

### createDebouncedURLSync()

```typescript
function createDebouncedURLSync(
  module: string,
  debounceMs?: number
): (sequence: SequenceData | null) => void;
```

Creates a debounced URL sync function for use in reactive effects.

**Example:**

```typescript
const syncURL = createDebouncedURLSync("construct", 500);

$effect(() => {
  syncURL(currentSequence);
});
```

## Share URL Generation API

### generateShareURL()

```typescript
function generateShareURL(
  sequence: SequenceData,
  module: string,
  options?: { compress?: boolean }
): {
  url: string;
  length: number;
  compressed: boolean;
  savings: number;
};
```

### parseDeepLink()

```typescript
function parseDeepLink(
  url: string
): { module: string; sequence: SequenceData } | null;
```

### estimateURLLength()

```typescript
function estimateURLLength(
  sequence: SequenceData,
  module: string,
  compress?: boolean
): number;
```

### encodeSequence()

```typescript
function encodeSequence(sequence: SequenceData): string;
```

### decodeSequence()

```typescript
function decodeSequence(encoded: string): SequenceData;
```

### deepLinkStore

```typescript
class DeepLinkStore {
  set(moduleId: string, sequence: SequenceData, tabId?: string): void;
  consume(moduleId: string): { sequence: SequenceData; tabId?: string } | null;
  has(moduleId: string): boolean;
  clear(): void;
}
```

## Examples

### Simple: Just Copy the URL Bar!

With live URL sync, sharing is as simple as:

```typescript
// Copy current URL to clipboard
navigator.clipboard.writeText(window.location.href);
```

The URL is always up-to-date with your current sequence!

### Advanced: Share Button with Analytics

```svelte
<script lang="ts">
  import { generateShareURL } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { createModuleState } from "./state";

  const state = createModuleState();

  async function handleShare() {
    const sequence = state.currentSequence;
    if (!sequence) return;

    const { url, length, compressed, savings } = generateShareURL(
      sequence,
      "construct",
      { compress: true }
    );

    await navigator.clipboard.writeText(url);

    // Optional: Track sharing analytics
    console.log(
      `Shared! Length: ${length}, Compressed: ${compressed}, Savings: ${savings}%`
    );

    // Show user feedback
    toast.success("Link copied to clipboard!");
  }
</script>

<button on:click={handleShare}> 📤 Share Sequence </button>
```

Or even simpler - just tell users to copy the URL bar!

### Testing Deep Links

```typescript
// Test encoding/decoding
import {
  encodeSequence,
  decodeSequence,
} from "#lib/shared/navigation/services/sequence-encoder.js";

const testSequence: SequenceData = {
  /* ... */
};
const encoded = encodeSequence(testSequence);
console.log("Encoded:", encoded);

const decoded = decodeSequence(encoded);
console.log("Decoded:", decoded);
console.log(
  "Matches:",
  JSON.stringify(testSequence.steps) === JSON.stringify(decoded.steps)
);
```
