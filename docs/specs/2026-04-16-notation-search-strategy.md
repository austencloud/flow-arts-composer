# TKA Notation Search Strategy: Standard vs. Spelled

**Date:** April 16, 2026  
**Status:** PROPOSED

## Overview
This document specifies the dual-mode search strategy for TKA sequences. It distinguishes between **Standard Continuity Search** (choreography-first) and **Spelled Word Search** (mnemonic-first).

---

## 1. Search Modes

### A. Standard Mode (Strict Continuity)
*   **Goal:** Find valid choreographed sequences.
*   **Keyboard Behavior:** "Context-Aware." Disables any letter that does not share a position group with the previous letter's end position (e.g., if letter 1 ends in `Alpha`, only letters starting in `Alpha` are enabled).
*   **Filtering Logic:** Matches sequences that strictly contain the typed string. Prioritizes results where the sequence **starts with** the search query.

### B. Spelled Mode (Fuzzy / Bridge Search)
*   **Goal:** Find sequences that "spell out" a word (e.g., "DOG", "CAT"), potentially using "bridge letters" to connect the positions.
*   **Keyboard Behavior:** All keys enabled. No position continuity checking.
*   **Filtering Logic:** 
    *   Treats the input as an ordered list of "Must-Have" letters.
    *   Matches sequences that contain these letters in the specified order, even if other letters exist between them.
    *   *Example:* Searching "D-G" (D then G) matches a sequence choreographed as `D-O-G`.

---

## 2. Technical Requirements

### Position Continuity Logic
Standard Mode uses the `LetterDomainService` to determine valid transitions.
*   `canFollow(prev, next)`: `prev.endPlacement.normalized === next.startPlacement.normalized`.
*   Normalization maps specific positions (e.g., `alpha1`, `alpha3`) to their root groups (`alpha`).

### Bridge Letter Detection (Future Phase)
To fully support Spelled Mode, the filter service must be updated to handle non-contiguous matches:
```typescript
function matchesFuzzy(sequence: string, query: string): boolean {
  // Logic to find query letters within sequence in order
}
```

### UI Interaction
*   **FAB:** Floating Action Button at bottom-right triggers the Keyboard Terminal.
*   **Keyboard Header:** Displays the current notation + result count + Mode Toggle.
*   **Type 1 Synthesis:** Represented by a Blue/Purple gradient.

---

## 3. Ergonomics
*   **Backspace:** Bottom-right (Standard).
*   **Dash:** Bottom-left (Modifier).
*   **Results:** Live-updating in the background; accessible by closing/flicking the keyboard.
