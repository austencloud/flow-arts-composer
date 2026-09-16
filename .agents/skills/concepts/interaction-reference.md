# Interaction Philosophy & Patterns Reference

**Read this before designing any lesson.**

---

## The Interaction Philosophy

**Every lesson is a toy first, a teacher second.**

These 8 principles govern every lesson we build. They are non-negotiable.

### 1. Hands On In 5 Seconds
The learner touches something interactive within 5 seconds of opening any lesson. Not reading. Not watching. Touching, dragging, tapping, manipulating. The explanation lives inside the interaction, not before it.

### 2. Discovery Over Instruction
If the learner can figure it out by doing, don't explain it with words. Structure the interaction so the concept reveals itself. "Alpha means hands at opposite points" is a fact. Dragging two hands to opposite points and watching the label appear is an insight. Insights stick. Facts evaporate.

### 3. The Mistake Is The Lesson
Wrong answers show what the wrong answer MEANS, not just that it's wrong. When someone confuses alpha and beta, animate the difference. The correction produces an aha moment, not shame. Every error leaves the learner knowing more than before.

### 4. Animate The Transformation
Motion carries meaning. A staff rotating to show "1 turn" — that animation teaches. A card bouncing — that decorates. Both are fine. Never confuse them. Teaching animations are essential. Decorative animations are seasoning.

### 5. Difficulty Is A Ramp
Start with something the learner can do (recalling previous knowledge). Build through guided challenge (new concept with scaffolding). End with unassisted mastery (scaffolding removed). Fail once or twice in the middle — that's the productive struggle that makes success earned.

### 6. Celebrate Sparingly And Unpredictably
Subtle glow on every correct answer. Particle burst on 3rd streak. Full flourish on perfect score. Never the same response twice in succession. Variable timing keeps anticipation alive. Never make the learner dismiss a celebration — it enhances flow, not interrupts it.

### 7. Spatial Concepts Deserve Spatial Interactions
TKA teaches hand placements on a grid, orientations of props, paths through space. The interface must be spatial too. Drag hands to grid locations. Rotate props with gestures. Trace motion paths with your finger. When interaction mirrors concept, embodied cognition locks learning into motor memory.

### 8. Earn Every Layer Of Complexity
One thing at a time. Master placements before motions. Master motions before turns. Never two unfamiliar things simultaneously. Progressive disclosure isn't just a UI pattern — it's the curriculum architecture.

---

## The Fire Jam Test (For Lesson Copy)

Read any text in the lesson out loud. Would you say this to another spinner at a fire jam?

- "Tap the grid points where your hands go" — yes
- "Explore the fundamental spatial relationships of hand placements" — no

If it sounds like a textbook, rewrite it. Lessons should sound like a friend showing you something cool.

---

## Interaction Patterns (Ranked By Impact)

Use these patterns when designing lesson interactions. Higher rank = higher priority.

| Rank | Pattern | Description | Best For |
|------|---------|-------------|----------|
| 1 | **Direct Manipulation Discovery** | Drag/tap to discover concept — label appears after you create the condition | Placements, grid modes, orientations |
| 2 | **Scaffolded Problem Sequences** | Chain of 3-5 micro-problems where each answer teaches the next. No text between. | Motion types, letter categories |
| 3 | **Transformation Animation** | Animate the continuous change, not before/after snapshots | Turns, shifts, dashes, reversals |
| 4 | **Variable Micro-Celebrations** | Brief celebrations (200-400ms) on correct answers, bigger at streak milestones | All quizzes |
| 5 | **Mastery Gradient** | Continuous ring/bar: Encountered → Practiced → Familiar → Proficient → Mastered | All concepts |
| 6 | **Constraint Puzzles** | Goal + constraints, learner finds solution. Constraints make it solvable not trivial | Letter types, word construction |
| 7 | **Spatial Challenge Escalation** | Start with one variable, add second only after first mastered | Foundation → Letters → Combinations |
| 8 | **Semantic Feedback** | Wrong answer animates what your answer WOULD have meant, then contrasts with correct | All quizzes |
| 9 | **Construction Over Recognition** | "Build an X" instead of "Which one is X?" | Placements, motion types, letters |
| 10 | **Speed Rounds** | Timed classification with streaks. Builds automaticity after understanding | Mastery drills (unlock after quiz) |

---

## Anti-Patterns (What Kills The Dopamine)

| Anti-Pattern | Why It's Bad | Fix |
|--------------|-------------|-----|
| Wall of text before interaction | Brain says "this is studying, not playing" | First interaction in 5 seconds |
| Points for existing | Erodes intrinsic motivation (overjustification effect) | Rewards for genuine accomplishment only |
| Uniform difficulty | No flow channel → boredom or anxiety | Ramp: easy recall → guided challenge → unassisted mastery |
| Punishing mistakes | Triggers threat response, shuts down hippocampus | Every wrong answer should teach via semantic feedback |
| Mandatory UI interruptions | Breaks flow state | Celebrations happen WITHIN the flow, no modals to dismiss |
| Explaining what can be discovered | Robs learner of aha moment | Structure interaction so concept reveals itself |

---

## Lesson Architecture Patterns

### Experience Component Structure

Every concept lesson follows this component pattern:

```
ConceptDetailView (shell — handles progress, persistence)
  └── [Concept]ConceptExperience.svelte (orchestrator)
       ├── Interactive exploration phase (discovery, not instruction)
       ├── Guided practice phase (scaffolded challenges)
       └── Assessment phase (construction over recognition)
```

### State Management

- `getExperiencePersistence(conceptId)` — survives HMR + page reload
- `conceptProgressTracker` — via `getConceptProgressTracker()`, tracks mastery gradient
- `hapticFeedback` — via `getHapticFeedback()`, use for all interactions

### When Building A New Lesson

1. **Start with the interaction, not the content.** What will the user's hands do?
2. **Prototype the core mechanic first.** Get one interaction feeling great before building the full lesson.
3. **Add phases incrementally.** Discovery → practice → assessment. Test each before adding the next.
4. **Test on mobile first.** Touch is the primary input. Desktop is the adaptation.
5. **Verify with the philosophy checklist:**
   - [ ] Hands-on in 5 seconds?
   - [ ] Discovery over instruction?
   - [ ] Mistakes teach?
   - [ ] Transformation animations carry meaning?
   - [ ] Difficulty ramps?
   - [ ] Celebrations are variable and non-blocking?
   - [ ] Spatial concepts use spatial interactions?
   - [ ] One new thing at a time?

---

## Science Behind The Philosophy

Key research findings that inform these principles:

- **Earned insights** trigger hippocampal bursts → dramatically better long-term recall than direct instruction
- **Spaced micro-rewards** (every 5-10 interactions, not every one) → 10x fewer repetitions needed to learn
- **Embodied cognition** (physical manipulation of spatial concepts) → statistically stronger neural pathways than reading
- **Variable reward timing** → sustained dopamine activity during anticipation, not just receipt
- **Flow channel** (challenge slightly exceeds skill) → engagement. Static difficulty → disengagement
- **Productive failure** → struggling before insight makes the insight stick. Easy success teaches nothing

Sources documented in `docs/learn/interaction-research.md`.
