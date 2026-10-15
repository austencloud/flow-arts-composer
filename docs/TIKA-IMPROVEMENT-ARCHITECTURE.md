# TIKA Improvement Architecture

**Repository status (2026-10-14):** This January architecture remains a proposal for new files and workflow phases. Existing runtime model choices are owned by `src/lib/features/tika/domain/tika-model-catalog.ts` and include Haiku, Sonnet and DeepSeek; the Haiku-only table and token costs below are historical assumptions. Root scripts include `tika:evaluate` and `tika:opus`; curation/analysis commands are not implemented in `package.json`.

**Date:** January 2026
**Status:** Draft for Review

---

## 1. Vision

Transform TIKA from a "Haiku with tools" into a **domain-specialized teaching assistant** that rivals what a human TKA expert would say.

### Goals

1. **Behavioral Consistency** - Same question → similar quality answer every time
2. **Persona Awareness** - Adapt tone/depth based on user type
3. **Level Fidelity** - Never use concepts the user hasn't learned
4. **Token Efficiency** - Minimize prompt size without losing quality
5. **Continuous Improvement** - Streamlined loop to identify and fix gaps

### The Opus-Haiku Partnership

| Model     | Role                                             | When                 |
| --------- | ------------------------------------------------ | -------------------- |
| **Haiku** | Production runtime                               | Every user question  |
| **Opus**  | Curriculum designer, example generator, reviewer | Development/QA cycle |

Haiku is cheap and fast. Opus is the "wise teacher" who trains Haiku through carefully curated examples and periodic quality audits.

---

## 2. Core Components

### 2.1 Example Library

The most impactful improvement. Few-shot examples show Haiku _how to behave_, not just what to know.

```
src/lib/features/tika/
├── examples/
│   ├── index.ts              # Example selector logic
│   ├── beginner-curious.ts   # Warm, encouraging, analogy-heavy
│   ├── power-user.ts         # Concise, technical, precise
│   ├── skeptic.ts            # Benefit-focused, practical
│   └── academic.ts           # Systematic, cite-able, formal
```

### 2.2 Prompt Engine

Modular prompt assembly that's token-conscious.

```
src/lib/features/tika/prompts/
├── core-persona.ts           # ~200 tokens, always loaded
├── level-constraints.ts      # Dynamic based on user level
├── tool-guidance.ts          # When/how to call tools
├── negative-examples.ts      # "Don't do this" patterns
└── assembler.ts              # Combines pieces efficiently
```

### 2.3 Evaluation Framework

Automated testing of Haiku responses against quality criteria.

```
scripts/tika/
├── evaluate.ts               # Run scenarios, grade responses
├── scenarios/
│   ├── level-1-scenarios.json
│   ├── level-2-scenarios.json
│   ├── edge-cases.json
│   └── misconceptions.json
└── reports/                  # Generated evaluation reports
```

### 2.4 Opus Review Pipeline

Periodic quality audits using Opus as reviewer.

```
scripts/tika/
├── opus-review.ts            # Send Haiku responses to Opus for grading
├── curate-examples.ts        # Promote good responses to example library
└── generate-scenarios.ts     # Have Opus create new test scenarios
```

---

## 3. Data Models

### 3.1 Few-Shot Example

```typescript
interface TikaExample {
  id: string;
  persona: "beginner" | "power-user" | "skeptic" | "academic";
  userLevel: 1 | 2 | 3 | 4;
  category: "letter" | "term" | "comparison" | "concept" | "misconception";

  // The interaction
  userQuestion: string;
  idealResponse: string;

  // Metadata
  toolsUsed: string[]; // Which tools Haiku should call
  keyPoints: string[]; // Critical elements the response must include
  antiPatterns?: string[]; // What to explicitly avoid

  // Quality tracking
  source: "opus-generated" | "opus-rewrite" | "human-curated";
  score?: number; // Opus grading score (1-10)
  createdAt: Date;
}
```

### 3.2 Test Scenario

```typescript
interface TikaScenario {
  id: string;
  category: string;
  userLevel: 1 | 2 | 3 | 4;
  persona: string;

  question: string;

  // Grading criteria
  mustInclude: string[]; // Required concepts/terms
  mustNotInclude: string[]; // Level violations to catch
  expectedTools: string[]; // Tools that should be called
  expectedTone: string; // e.g., "encouraging", "technical"

  // Optional: Known-good answer for comparison
  referenceAnswer?: string;
}
```

### 3.3 Evaluation Result

```typescript
interface EvaluationResult {
  scenarioId: string;
  haikuResponse: string;
  toolsCalled: string[];
  latencyMs: number;

  // Grades (1-10)
  grades: {
    domainAccuracy: number; // TKA correctness
    levelAppropriateness: number; // No forbidden terms
    personaMatch: number; // Tone/style fit
    conciseness: number; // Not over-explaining
    toolUsage: number; // Called appropriate tools
  };

  overallScore: number;
  opusNotes: string; // Detailed feedback

  // Action items
  recommendation: "promote" | "rewrite" | "investigate" | "acceptable";
  suggestedRewrite?: string; // Opus's improved version
}
```

### 3.4 Prompt Assembly Config

```typescript
interface PromptConfig {
  // Core persona (always included)
  corePersonaTokens: number; // Target ~200

  // Dynamic sections
  levelConstraints: boolean; // Include level-specific limits
  toolGuidance: boolean; // Include tool calling hints

  // Examples
  fewShotCount: 2 | 3 | 4; // Number of examples to include
  exampleSelectionStrategy:
    | "random" // Random from matching persona/level
    | "similarity" // Closest to current question
    | "diverse"; // Cover different categories

  // Negative examples
  includeAntiPatterns: boolean; // "Don't do this" examples
  antiPatternCount: 0 | 1 | 2;
}
```

---

## 4. File Structure

```
src/lib/features/tika/
├── components/                  # (existing UI)
├── types.ts                     # (existing types)
│
├── examples/                    # NEW: Few-shot example library
│   ├── index.ts                 # Example selector
│   ├── types.ts                 # Example interfaces
│   ├── data/
│   │   ├── beginner-level1.json
│   │   ├── beginner-level2.json
│   │   ├── power-user.json
│   │   ├── skeptic.json
│   │   └── anti-patterns.json   # "Don't do this" examples
│   └── selectors/
│       ├── similarity-selector.ts
│       └── diverse-selector.ts
│
├── prompts/                     # NEW: Modular prompt engine
│   ├── index.ts                 # Main assembler
│   ├── core-persona.ts          # Base TIKA personality
│   ├── level-constraints.ts     # Dynamic level limits
│   ├── tool-guidance.ts         # When to call tools
│   └── negative-patterns.ts     # Common mistakes to avoid
│
└── evaluation/                  # NEW: Quality framework
    ├── scenarios/               # Test cases
    ├── graders/                 # Scoring logic
    └── reports/                 # Generated reports

scripts/tika/                    # NEW: Development tooling
├── evaluate.ts                  # Run evaluation suite
├── opus-review.ts               # Opus reviews Haiku responses
├── generate-scenarios.ts        # Opus creates test scenarios
├── curate-examples.ts           # Promote examples to library
└── analyze-gaps.ts              # Find weak areas

mcp-server/data/                 # (existing)
├── tka-glossary.json
├── letter-types.json
└── tika-examples.json           # NEW: Persisted examples
```

---

## 5. Workflows

### 5.1 Production Flow (Every User Question)

```
┌─────────────────────────────────────────────────────────────┐
│  User asks question                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CONTEXT GATHERING                                       │
│     ├─ User's level (1-4)                                   │
│     ├─ User's known concepts                                │
│     └─ Question category (letter? term? concept?)           │
│                                                             │
│  2. PROMPT ASSEMBLY                                         │
│     ├─ Core persona (~200 tokens)                           │
│     ├─ Level constraints (~50-100 tokens)                   │
│     ├─ 2-3 few-shot examples (~300 tokens)                  │
│     │   └─ Selected by similarity to question               │
│     └─ Tool guidance (~50 tokens)                           │
│                                                             │
│  3. HAIKU CALL (with tools)                                 │
│     └─ Tool loop: get_letter → respond                      │
│                                                             │
│  4. RESPONSE DELIVERY                                       │
│     └─ Plus: context panel, pictograph if relevant          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Improvement Cycle (Weekly/Sprint)

```
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: SCENARIO GENERATION (Opus)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Opus generates new scenarios based on:                     │
│  ├─ Identified gaps from last evaluation                    │
│  ├─ New curriculum areas added                              │
│  ├─ User feedback/complaints                                │
│  └─ Edge cases and misconceptions                           │
│                                                             │
│  Output: scenarios/*.json                                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PHASE 2: HAIKU EVALUATION                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Run all scenarios through Haiku:                           │
│  npm run tika:evaluate                                      │
│                                                             │
│  For each scenario:                                         │
│  ├─ Call TIKA API with question                             │
│  ├─ Capture response + tools called + latency               │
│  └─ Store in evaluation results                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PHASE 3: OPUS REVIEW                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Opus grades each Haiku response:                           │
│  npm run tika:opus                                   │
│                                                             │
│  For each response:                                         │
│  ├─ Grade on 5 dimensions (accuracy, level, tone, etc.)     │
│  ├─ Provide detailed notes                                  │
│  ├─ Recommend action: promote | rewrite | investigate       │
│  └─ If rewrite: generate ideal version                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PHASE 4: CURATION                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Process recommendations:                                   │
│  PROPOSED: curation (no root script)                                        │
│                                                             │
│  ├─ "promote": Add Haiku response to example library        │
│  ├─ "rewrite": Add Opus version to example library          │
│  ├─ "investigate": Flag for human review                    │
│  └─ "acceptable": No action needed                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  PHASE 5: ANALYSIS                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Identify patterns:                                         │
│  PROPOSED: analysis (no root script)                                       │
│                                                             │
│  ├─ Which categories score lowest?                          │
│  ├─ Which level transitions are problematic?                │
│  ├─ What misconceptions keep appearing?                     │
│  └─ Generate report with recommendations                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Real-Time Feedback Loop (Future)

```
┌─────────────────────────────────────────────────────────────┐
│  User interaction signals quality:                          │
│                                                             │
│  POSITIVE SIGNALS:                                          │
│  ├─ User asks follow-up question (engaged)                  │
│  ├─ User tries suggested letter/term                        │
│  └─ Long session duration                                   │
│                                                             │
│  NEGATIVE SIGNALS:                                          │
│  ├─ User rephrases same question (confusion)                │
│  ├─ User asks "what do you mean by X?" (level violation)    │
│  └─ Short session abandonment                               │
│                                                             │
│  → Log interactions for periodic Opus review                │
│  → Flag confused interactions for investigation             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Token Economics

### Current Prompt Size

| Section         | Tokens (approx) |
| --------------- | --------------- |
| System prompt   | ~1,200          |
| User question   | ~20-100         |
| Tool results    | ~200-500        |
| **Total Input** | ~1,500-1,800    |

### Optimized Prompt Size

| Section               | Tokens (approx) |
| --------------------- | --------------- |
| Core persona          | ~200            |
| Level constraints     | ~75             |
| Few-shot examples (3) | ~350            |
| Tool guidance         | ~50             |
| User question         | ~20-100         |
| Tool results          | ~200-500        |
| **Total Input**       | ~900-1,300      |

**Savings: ~30-40% reduction** while improving quality through examples.

### Cost Comparison (per 1000 questions)

| Model                      | Input Tokens | Output Tokens | Cost   |
| -------------------------- | ------------ | ------------- | ------ |
| Haiku (current)            | 1.5M         | 500K          | ~$0.50 |
| Haiku (optimized)          | 1.0M         | 500K          | ~$0.35 |
| Opus (review, 100 samples) | 200K         | 50K           | ~$4.50 |

Running Opus review on 10% of responses adds quality assurance for ~$5/1000 questions.

---

## 7. Example Library Design

### 7.1 Persona Definitions

```typescript
const PERSONA_PROFILES = {
  beginner: {
    description: "No flow arts background, curious and eager",
    tone: "warm, encouraging, patient",
    vocabulary: "analogies, real-world comparisons",
    responseLength: "2-4 sentences for simple, 4-6 for complex",
    hallmarks: [
      "Uses 'like...' comparisons",
      "Celebrates small understanding",
      "Proactively explains jargon",
      "Invites follow-up questions",
    ],
  },

  powerUser: {
    description: "Experienced spinner, knows poi/staff terminology",
    tone: "efficient, technical, precise",
    vocabulary: "domain terms without explanation",
    responseLength: "1-3 sentences, direct",
    hallmarks: [
      "Skips basic context",
      "Uses TKA terms naturally",
      "Compares to familiar concepts",
      "Suggests advanced variations",
    ],
  },

  skeptic: {
    description: "Questioning value of notation system",
    tone: "practical, evidence-based, respectful",
    vocabulary: "benefit-focused, concrete outcomes",
    responseLength: "2-4 sentences with examples",
    hallmarks: [
      "Acknowledges valid concerns",
      "Focuses on practical benefits",
      "Gives concrete use cases",
      "Doesn't oversell",
    ],
  },

  academic: {
    description: "Evaluating TKA for research/grants",
    tone: "systematic, formal, cite-able",
    vocabulary: "academic, structured",
    responseLength: "thorough but organized",
    hallmarks: [
      "Uses proper terminology",
      "Explains systematic structure",
      "References underlying theory",
      "Highlights novelty/contribution",
    ],
  },
};
```

### 7.2 Example Categories

1. **Letter Explanations** - "What is letter A?"
2. **Term Definitions** - "What does alpha mean?"
3. **Comparisons** - "How is Type 1 different from Type 3?"
4. **Concept Questions** - "Why are there 6 types?"
5. **Misconception Corrections** - "Both hands move, so it's Type 1, right?"
6. **Practical Applications** - "How do I use this for choreography?"
7. **Troubleshooting** - "My sequence doesn't loop, why?"

### 7.3 Anti-Pattern Examples

Critical for teaching Haiku what NOT to do:

```typescript
const ANTI_PATTERNS = [
  {
    bad: "Both hands move in Type 1, which makes it unique.",
    why: "Multiple types have both hands moving (Types 1, 3, 5). The distinction is that both SHIFT.",
    good: "Both hands shift (move to adjacent points) in Type 1.",
  },
  {
    bad: "Alpha is when hands are 180 degrees apart.",
    why: "Uses implementation language instead of domain language.",
    good: "Alpha means hands are at opposite grid points.",
  },
  {
    bad: "Let me explain quarter turns, which involve 90-degree rotations...",
    why: "User is at Level 1 - quarter turns are Level 3 concept.",
    good: "That involves concepts from a more advanced level. First, let's make sure you're comfortable with [current level concept].",
  },
];
```

---

## 8. Integration Points

### 8.1 With Existing System

| Component            | Integration                           |
| -------------------- | ------------------------------------- |
| `system-prompts.ts`  | Refactor to use modular assembler     |
| `+server.ts` (API)   | Add prompt config, log for evaluation |
| `knowledge-graph.ts` | Use for level constraint generation   |
| MCP server tools     | Keep as-is, tools work well           |

### 8.2 With CI/CD

```yaml
# .github/workflows/tika-quality.yml
name: TIKA Quality Gate

on:
  schedule:
    - cron: "0 0 * * 0" # Weekly
  workflow_dispatch:

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run TIKA evaluation
        run: npm run tika:evaluate
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: tika-evaluation-report
          path: scripts/tika/reports/
```

### 8.3 With Firebase (Future)

Store evaluation results and examples in Firestore for:

- Historical quality tracking
- A/B testing different prompt configs
- User feedback correlation

---

## 9. Implementation Phases

### Phase 1: Foundation (1-2 days)

1. Create file structure under `src/lib/features/tika/`
2. Define TypeScript interfaces for examples and scenarios
3. Build basic prompt assembler
4. Refactor `system-prompts.ts` to use new assembler

### Phase 2: Example Library (2-3 days)

1. Have Opus generate initial examples for each persona/level
2. Create example selector (similarity-based)
3. Add anti-pattern examples
4. A/B test: current prompt vs few-shot prompt

### Phase 3: Evaluation Framework (2-3 days)

1. Build scenario runner (`evaluate.ts`)
2. Create grading rubric (codified from this document)
3. Generate initial scenario set with Opus
4. Run baseline evaluation

### Phase 4: Opus Review Pipeline (2-3 days)

1. Build review script (`opus-review.ts`)
2. Create curation workflow (`curate-examples.ts`)
3. Build analysis/reporting (`analyze-gaps.ts`)
4. Run first improvement cycle

### Phase 5: Automation (1-2 days)

1. Add npm scripts for each workflow step
2. Create GitHub Action for weekly evaluation
3. Build simple dashboard for viewing reports

---

## 10. Success Metrics

| Metric                | Current (Estimate) | Target     |
| --------------------- | ------------------ | ---------- |
| Domain accuracy       | 85%                | 95%        |
| Level appropriateness | 70%                | 95%        |
| Persona match         | 60%                | 85%        |
| Response latency      | ~2s                | <1.5s      |
| Token usage           | ~1,500/req         | ~1,000/req |
| User satisfaction     | Unknown            | Measurable |

### How We'll Measure

1. **Domain Accuracy**: Opus grades correctness (1-10)
2. **Level Appropriateness**: Automated check for forbidden terms
3. **Persona Match**: Opus grades tone/style fit
4. **Latency**: Logged from API
5. **Tokens**: Logged from API
6. **Satisfaction**: Future: thumbs up/down on responses

---

## 11. Open Questions

1. **Example rotation**: How often should we rotate examples to prevent overfitting?
2. **Persona detection**: Should TIKA try to detect user persona automatically?
3. **Multi-language**: How do examples work with non-English glossaries?
4. **Streaming**: Should optimizations support streamed responses?
5. **Caching**: Can we cache tool results for common questions?

---

## Next Steps

1. **Review this document** - Adjust based on your priorities
2. **Generate initial examples** - I (Opus) can create the starter set
3. **Build the assembler** - Refactor system-prompts.ts
4. **Run baseline evaluation** - Know where we're starting from

---

_Document generated by Claude Opus 4.5 based on codebase analysis and 2026 best practices research._

**Sources:**

- [LLM Distillation Guide - Snorkel AI](https://snorkel.ai/blog/llm-distillation-demystified-a-complete-guide/)
- [Few-Shot Prompting Guide](https://www.promptingguide.ai/techniques/fewshot)
- [Distilling Step-by-Step - Google Research](https://research.google/blog/distilling-step-by-step-outperforming-larger-language-models-with-less-training-data-and-smaller-model-sizes/)
- [Claude Model Cascade - CodeGPT](https://www.codegpt.co/blog/anthropic-claude-models-complete-guide)
- [Agentic AI Frameworks 2026](https://www.instaclustr.com/education/agentic-ai/agentic-ai-frameworks-top-8-options-in-2026/)
- [Synthetic Data Generation - Arxiv 2025](https://arxiv.org/abs/2503.14023)
