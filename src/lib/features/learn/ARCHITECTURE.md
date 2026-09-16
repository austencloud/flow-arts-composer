# Learn Module Architecture

## Overview

The Learn module has been completely redesigned to support two distinct learning modes:

1. **Progressive Concept Mastery** - A structured 28-concept learning path mapped from TKA Level 1 curriculum
2. **Flash Card Drills** - Quick pictograph memorization quizzes (legacy system retained)

Plus **Codex** - An always-accessible slide-in reference panel for looking up letters.

## Visual Structure

```
Learn Tab
├── Header (LearnTabHeader)
│   ├── Concepts Tab 🎯
│   ├── Drills Tab ⚡
│   └── [Letters] Button → Opens Codex Panel
│
├── Concepts Tab Content
│   ├── ConceptPathView (default) - Scrollable card-based path
│   │   ├── ProgressHeader - Overall progress display
│   │   ├── Category Sections (Foundation, Letters, Combinations, Advanced)
│   │   └── ConceptCard × 28 - Individual concept cards
│   │
│   └── ConceptDetailView (when card clicked)
│       ├── Back Button → Returns to path
│       ├── Concept Header (icon, title, description)
│       ├── Stats Pills (progress %, accuracy %)
│       └── Tabs: Learn | Practice | Stats
│
├── Drills Tab Content (QuizTab)
│   ├── Quiz Selector (3 lesson types)
│   ├── Quiz Workspace (active quiz)
│   └── Results View
│
└── Codex Panel (CodexPanel)
    └── Slide-in from right with letter reference
```

## Key Components

### 1. LearnTab.svelte (Main Container)

- **Location**: `src/lib/modules/learn/LearnTab.svelte`
- **Purpose**: Top-level coordinator for all learn modes
- **Features**:
  - Tab routing (Concepts / Drills)
  - Concept detail view routing
  - Codex panel state management
  - Syncs with navigationState for persistence

### 2. LearnTabHeader.svelte

- **Location**: `src/lib/modules/learn/components/LearnTabHeader.svelte`
- **Purpose**: Navigation header with sub-tabs and Codex button
- **Features**:
  - 2 sub-tabs with icons: Concepts 🎯 | Drills ⚡
  - Animated active tab indicator (slide animation)
  - "Letters" button to open Codex panel
  - Haptic feedback on interactions
  - Fully responsive (compact on mobile)
  - 48px minimum touch targets

### 3. ConceptPathView.svelte

- **Location**: `src/lib/modules/learn/components/ConceptPathView.svelte`
- **Purpose**: Main scrollable view showing all 28 concepts
- **Features**:
  - ProgressHeader at top showing overall completion
  - Grouped by 4 categories with color-coded headers
  - 28 ConceptCard components with status indicators
  - Staggered fade-in animations per category
  - Celebration screen when all concepts completed
  - Auto-subscribes to progress updates

### 4. ConceptCard.svelte

- **Location**: `src/lib/modules/learn/components/ConceptCard.svelte`
- **Purpose**: Interactive card representing a single concept
- **Features**:
  - 4 states: Locked 🔒 | Available ⭕ | In Progress ▶️ | Completed ✅
  - Circular progress ring for in-progress/completed concepts
  - Shows concept icon, name, description, estimated time
  - Status badge with appropriate icon
  - Hover effects and click animations
  - Disabled state for locked concepts
  - Haptic feedback on click
  - 48px minimum touch target

### 5. ConceptDetailView.svelte

- **Location**: `src/lib/modules/learn/components/ConceptDetailView.svelte`
- **Purpose**: Full-screen detail view when concept is selected
- **Features**:
  - Back button to return to path view
  - Large concept header (icon, title, description)
  - Stats pills (progress %, accuracy %)
  - 3 tabs: **Learn** | **Practice** | **Stats**
    - **Learn Tab**: Key concepts list + PDF page references
    - **Practice Tab**: Coming soon placeholder (future integration)
    - **Stats Tab**: 6-card grid with metrics (correct, incorrect, accuracy, streak, time)
  - Completion badge when concept mastered
  - Auto-starts concept when opened
  - Haptic feedback on tab switches

### 6. ProgressHeader.svelte

- **Location**: `src/lib/modules/learn/components/ProgressHeader.svelte`
- **Purpose**: Animated progress display for overall completion
- **Features**:
  - Animated progress bar with shimmer effect
  - Motivational messages based on progress %
  - Quick stats: concepts completed, correct answers, badges
  - Compact mode option
  - Fully responsive

### 7. CodexPanel.svelte

- **Location**: `src/lib/modules/learn/components/CodexPanel.svelte`
- **Purpose**: Slide-in reference panel for quick letter lookup
- **Features**:
  - Slides in from right (300ms animation)
  - Backdrop overlay (click to close)
  - Embeds existing CodexComponent
  - Escape key to close
  - Desktop: 600px width panel
  - Mobile: Full-screen overlay
  - Custom scrollbar styling

## Domain Layer

### Types (types.ts)

- **Location**: `src/lib/modules/learn/domain/types.ts`
- **Exports**:
  - `ConceptCategory`: 'foundation' | 'letters' | 'combinations' | 'advanced'
  - `ConceptStatus`: 'locked' | 'available' | 'in-progress' | 'completed'
  - `LearnConcept`: Full concept definition (28 concepts)
  - `ConceptProgress`: User progress per concept
  - `LearningProgress`: Overall user progress
  - `ConceptDetailView`: 'learn' | 'practice' | 'stats'
  - `ConceptStats`: Achievement statistics

### Concepts (concepts.ts)

- **Location**: `src/lib/modules/learn/domain/concepts.ts`
- **Exports**:
  - `TKA_CONCEPTS`: Array of all 29 concepts mapped from the Level 1 curriculum and Guide
  - `CONCEPT_CATEGORIES`: Category metadata with colors/icons
  - Helper functions:
    - `getConceptsByCategory(category)`
    - `getConceptById(id)`
    - `getNextConcept(currentId)`
    - `isConceptUnlocked(conceptId, completedIds)`

### 28 Concept Curriculum Map

Mapped directly from TKA Level 1.pdf:

#### Foundation (13 concepts)

1. Grid - Diamond/Box grid system (p7)
2. Placements - Beta/Gamma/Alpha placements (p8)
3. Staff Motions - Basic staff movements (p9)
4. Type 1 Motion - Dash/Static/Shift (p10)
5. Type 2 Motion - Vertical-plane Crosser (p11)
6. Type 3 Motion - Horizontal-plane Crosser (p12)
7. Type 4 Motion - Same-plane Crosser (p13)
8. Type 5 Motion - Toggler (p14)
9. Type 6 Motion - Floater (p15)
10. Staff Work - Isolations and Body Frames (p16)
11. Negative Space - Understanding absence of motion (p17)
12. Reading Pictographs - How to interpret notation (p18-19)
13. Type Application - Using all 6 motion types (p20)

#### Letters (8 concepts)

14. Type 1 Letters - Dash/Static/Shift letters (p21)
15. Type 2 Letters - Vertical crossers (p22)
16. Type 3 Letters - Horizontal crossers (p23)
17. Type 4 Letters - Same-plane crossers (p24)
18. Type 5 Letters - Togglers (p25)
19. Type 6 Letters - Floaters (p26)
20. Letter Recognition - Reading all letter types (p27)
21. Letter Construction - Building your own (p28)

#### Combinations (6 concepts)

22. Words - Combining letters (p29-32)
23. LOOPs Introduction - Continuous Angular Patterns (p33-35)
24. Simple LOOPs - Basic 2-3 letter patterns (p36-37)
25. Complex LOOPs - Advanced multi-letter patterns (p38-39)
26. Reversals - Backward letter sequences (p40)
27. LOOP Variations - Expanding pattern vocabulary (p41)

#### Advanced (1 concept)

28. Motion Type Mastery - Fluently using all concepts (p42-47)

Each concept includes:

- Prerequisites (unlocked progressively)
- PDF page references
- Estimated completion time (5-30 minutes)
- Key learning points

## Services

### ConceptProgressService

- **Location**: `src/lib/modules/learn/services/ConceptProgressService.ts`
- **Purpose**: Manages user progress with localStorage persistence
- **Key Methods**:
  - `getProgress()` - Get full learning progress
  - `getConceptStatus(conceptId)` - Check if locked/available/in-progress/completed
  - `getConceptProgress(conceptId)` - Get detailed progress for concept
  - `startConcept(conceptId)` - Begin learning a concept
  - `recordPracticeAttempt(conceptId, correct, time)` - Track quiz results
  - `completeConcept(conceptId)` - Mark concept as mastered
  - `getConceptsDueForReview()` - Spaced repetition support
  - `resetProgress()` - Clear all progress
  - `subscribe(callback)` - Observable pattern for updates

- **Features**:
  - localStorage persistence (key: 'tka_learning_progress')
  - Spaced repetition intervals: 1, 3, 7, 14, 30 days
  - Badge system: foundation-master, letter-master, streak-10, perfect-accuracy
  - Accuracy tracking and streak counting
  - Time tracking per concept
  - Singleton instance exported as `conceptProgressService`

## Technical Specifications

### Mobile-First Design

- **Touch Targets**: 44x52px minimum (WCAG 2.2 Level AA)
- **Touch Spacing**: 16px between interactive elements
- **Breakpoints**:
  - 480px: Small mobile
  - 768px: Tablet
  - 992px: Desktop
  - 1200px: Large desktop

### Animations

- **Duration**: 200-300ms for interactions
- **Easing**: cubic-bezier(0.16, 1, 0.3, 1) for natural motion
- **Properties**: transform, opacity (hardware-accelerated)
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce`

### Accessibility

- **ARIA Labels**: All interactive elements properly labeled
- **Keyboard Navigation**: Full support with visible focus indicators
- **Screen Readers**: Semantic HTML with role attributes
- **Focus Management**: 2px outline with 2px offset on `:focus-visible`
- **Color Contrast**: WCAG AA compliant

### State Management

- **Svelte 5 Runes**: $state, $derived, $props, $effect
- **Navigation State**: Synced with navigationState for persistence
- **Observable Pattern**: ConceptProgressService with subscribers
- **Local Storage**: Automatic persistence of progress

## Integration Points

### 1. Navigation State

The Learn module integrates with the global navigation state:

```typescript
// Learn modes are defined in navigationState
export const LEARN_MODES: ModeOption[] = [
  { id: "concepts", label: "Concepts", ... },
  { id: "drills", label: "Drills", ... }
];

// Current mode persists to localStorage
navigationState.setLearnMode('concepts');
```

### 2. Existing Quiz System

The flash card drills (QuizTab) are the existing quiz infrastructure:

- 3 lesson types: Pictograph→Letter, Letter→Pictograph, Valid Next Pictograph
- Quiz modes: Fixed questions, Countdown timer
- Progress tracking: Accuracy, streaks, time
- Results view with retry/return options

**Future**: Concept-specific practice mode will integrate with this quiz infrastructure.

### 3. Codex Service

CodexPanel embeds the existing CodexComponent which uses ICodexService:

- Pictograph grid display
- Filtering and search
- Pictograph selection callbacks

## User Flow

### First-Time User

1. Lands on **Concepts** tab (default)
2. Sees ProgressHeader showing 0% completion
3. Sees 28 concept cards:
   - Concept #1 (Grid) is **Available** ⭕
   - Concepts #2-28 are **Locked** 🔒
4. Clicks Grid concept card → Opens ConceptDetailView
5. Reads key concepts in **Learn** tab
6. Switches to **Practice** tab (shows "coming soon")
7. Clicks back → Returns to ConceptPathView
8. Can switch to **Drills** tab for flash card quizzes
9. Can click **Letters** button for Codex reference panel

### Returning User (50% Complete)

1. Lands on **Concepts** tab
2. ProgressHeader shows "50% Complete - Halfway there!"
3. Concepts #1-14 show as **Completed** ✅
4. Concept #15 shows as **In Progress** ▶️ (75% complete)
5. Concepts #16-28 are **Locked** 🔒 (prerequisites not met)
6. Can review any completed concept
7. Can continue from concept #15

### Completed User (100%)

1. Lands on **Concepts** tab
2. ProgressHeader shows "100% Complete - You've mastered all concepts!"
3. All 28 concepts show **Completed** ✅
4. Celebration screen appears
5. Can review any concept
6. Can practice drills to maintain mastery

## Future Enhancements

### Short-Term (Next Iteration)

1. **Concept-Specific Practice**:
   - Generate quiz questions per concept
   - Map questions to concept topics
   - Integrate with existing quiz infrastructure
   - Show practice in ConceptDetailView Practice tab

2. **Spaced Repetition Reviews**:
   - Surface concepts due for review
   - "Review" badge on concept cards
   - Daily review queue

3. **Badge Display**:
   - Show earned badges in ProgressHeader
   - Badge modal with descriptions
   - Achievement notifications

### Medium-Term

1. **PDF Integration**:
   - Embed relevant PDF pages in Learn tab
   - Deep link from concept → specific pages
   - Synchronized highlighting

2. **Progress Analytics**:
   - Time spent per concept
   - Accuracy trends over time
   - Concept difficulty heatmap

3. **Social Features**:
   - Share progress with friends
   - Leaderboards
   - Challenge others

### Long-Term

1. **Adaptive Learning**:
   - AI-powered question generation
   - Difficulty adjustment based on performance
   - Personalized learning paths

2. **Video Tutorials**:
   - Embed instructional videos per concept
   - Interactive demonstrations

3. **Community Content**:
   - User-generated practice questions
   - Peer explanations

## Files Created/Modified

### New Files

- `src/lib/modules/learn/domain/types.ts` - Type definitions
- `src/lib/modules/learn/domain/concepts.ts` - 28 concept curriculum
- `src/lib/modules/learn/domain/index.ts` - Domain exports
- `src/lib/modules/learn/services/ConceptProgressService.ts` - Progress tracking
- `src/lib/modules/learn/components/ProgressHeader.svelte` - Overall progress
- `src/lib/modules/learn/components/ConceptCard.svelte` - Individual concept cards
- `src/lib/modules/learn/components/ConceptPathView.svelte` - Scrollable path view
- `src/lib/modules/learn/components/ConceptDetailView.svelte` - Full concept detail
- `src/lib/modules/learn/components/CodexPanel.svelte` - Slide-in reference panel
- `src/lib/modules/learn/components/LearnTabHeader.svelte` - Navigation header
- `src/lib/modules/learn/ARCHITECTURE.md` - This document

### Modified Files

- `src/lib/modules/learn/LearnTab.svelte` - Complete restructure with new routing
- `src/lib/modules/learn/index.ts` - Added exports for new components
- `src/lib/shared/navigation/state/navigation-state.svelte.ts` - Updated LEARN_MODES and default

## Testing Recommendations

### Manual Testing Checklist

- [ ] Concepts tab loads with 28 cards
- [ ] Only first concept is unlocked by default
- [ ] Click concept card → Opens detail view
- [ ] Back button → Returns to path view
- [ ] Drills tab shows existing quiz selector
- [ ] Letters button opens Codex panel
- [ ] Codex panel slides in from right
- [ ] Click backdrop → Closes Codex panel
- [ ] Escape key → Closes Codex panel
- [ ] Tab navigation syncs with URL/state
- [ ] Progress persists after page reload
- [ ] Mobile: All touch targets are 48px+
- [ ] Mobile: Tabs are compact
- [ ] Mobile: Codex panel is full-screen
- [ ] Keyboard: Tab through all interactive elements
- [ ] Keyboard: Focus indicators are visible
- [ ] Animations respect reduced motion preference

### Unit Tests to Add

- ConceptProgressService state management
- Concept unlock logic based on prerequisites
- Progress calculation accuracy
- Spaced repetition interval calculation
- Badge earning conditions

### Integration Tests to Add

- Complete concept flow (start → practice → complete)
- Progress persistence across sessions
- Tab navigation state synchronization
- Codex panel open/close behavior

## Performance Considerations

### Optimizations Implemented

- **Component Reuse**: Tab panels use `display: none` instead of conditional rendering to preserve state
- **Lazy Rendering**: ConceptDetailView only renders when concept is selected
- **Hardware Acceleration**: All animations use transform/opacity for GPU acceleration
- **Subscription Pattern**: ConceptProgressService notifies subscribers only on changes

### Future Optimizations

- Virtual scrolling for concept list (when >50 concepts)
- Code splitting for Quiz tab (lazy load on tab switch)
- Image lazy loading for concept icons
- Service worker for offline progress sync

## Conclusion

The Learn module now provides a comprehensive, dual-mode learning experience:

- **Progressive path** for structured curriculum mastery
- **Flash card drills** for quick memorization practice
- **Always-accessible reference** via Codex panel

The architecture is modular, extensible, and follows modern UX best practices for educational apps. All components are fully accessible, mobile-optimized, and ready for future enhancements like concept-specific practice and spaced repetition reviews.
