<script lang="ts">
  import SegmentedSequenceProgressBar from "#lib/shared/animation-engine/components/layers/SegmentedSequenceProgressBar.svelte";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";

  // Mock sequence data with varied durations
  const mockSequence1: StepData[] = [
    createStepData({ stepNumber: 1, duration: 1.0, letter: Letter.A }),
    createStepData({ stepNumber: 2, duration: 2.0, letter: Letter.B }),
    createStepData({ stepNumber: 3, duration: 0.5, letter: Letter.C }),
    createStepData({ stepNumber: 4, duration: 1.5, letter: Letter.D }),
  ];

  const mockSequence2: StepData[] = [
    createStepData({ stepNumber: 1, duration: 1.0, letter: Letter.X }),
    createStepData({ stepNumber: 2, duration: 1.0, letter: Letter.PSI }),
    createStepData({ stepNumber: 3, duration: 1.0, letter: Letter.DELTA }),
    createStepData({ stepNumber: 4, duration: 1.0, letter: Letter.T }),
    createStepData({ stepNumber: 5, duration: 1.0, letter: Letter.GAMMA }),
    createStepData({ stepNumber: 6, duration: 1.0, letter: Letter.S }),
  ];

  const mockSequence3: StepData[] = [
    createStepData({ stepNumber: 1, duration: 0.5, letter: Letter.A }),
    createStepData({ stepNumber: 2, duration: 0.5, letter: Letter.B }),
    createStepData({ stepNumber: 3, duration: 2.0, letter: Letter.C }),
    createStepData({ stepNumber: 4, duration: 0.5, letter: Letter.D }),
    createStepData({ stepNumber: 5, duration: 0.5, letter: Letter.E }),
  ];

  // Animation state for each demo
  let demo1CurrentStep = $state(0);
  let demo2CurrentStep = $state(0);
  let demo3CurrentStep = $state(0);
  let demo4CurrentStep = $state(0);
  let demo5CurrentStep = $state(0);
  let demo6CurrentStep = $state(0);
  let demo7CurrentStep = $state(0);

  let animationActive = $state(true);
  const darkMode = true; // Always dark mode

  // Auto-animate all demos
  $effect(() => {
    if (!animationActive) return;

    const intervalId = setInterval(() => {
      demo1CurrentStep = ((demo1CurrentStep + 0.05) % mockSequence1.length);
      demo2CurrentStep = ((demo2CurrentStep + 0.03) % mockSequence2.length);
      demo3CurrentStep = ((demo3CurrentStep + 0.04) % mockSequence3.length);
      demo4CurrentStep = ((demo4CurrentStep + 0.06) % mockSequence1.length);
      demo5CurrentStep = ((demo5CurrentStep + 0.05) % mockSequence2.length);
      demo6CurrentStep = ((demo6CurrentStep + 0.04) % mockSequence3.length);
      demo7CurrentStep = ((demo7CurrentStep + 0.05) % mockSequence2.length);
    }, 50);

    return () => clearInterval(intervalId);
  });

  function handleSeek1(targetStep: number) {
    demo1CurrentStep = targetStep;
  }

  function handleSeek2(targetStep: number) {
    demo2CurrentStep = targetStep;
  }

  function handleSeek3(targetStep: number) {
    demo3CurrentStep = targetStep;
  }

  function handleSeek4(targetStep: number) {
    demo4CurrentStep = targetStep;
  }

  function handleSeek5(targetStep: number) {
    demo5CurrentStep = targetStep;
  }

  function handleSeek6(targetStep: number) {
    demo6CurrentStep = targetStep;
  }

  function handleSeek7(targetStep: number) {
    demo7CurrentStep = targetStep;
  }
</script>

<svelte:head>
  <title>Segmented Progress Bar Variants - Flow Arts Composer</title>
</svelte:head>

<div class="page" class:dark={darkMode}>
  <div class="header">
    <h1>Segmented Sequence Progress Bar</h1>
    <p class="subtitle">Duration-Aware • Interactive Scrubbing • 7 Visual Styles</p>

    <div class="controls">
      <button onclick={() => (animationActive = !animationActive)}>
        {animationActive ? "⏸ Pause" : "▶ Play"}
      </button>
    </div>
  </div>

  <div class="demos-grid">
    <!-- Demo 1: Minimal -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Minimal</h2>
        <p>Flat segments with subtle borders</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>A (1s), B (2s), C (0.5s), D (1.5s)</span>
          <span class="step-indicator">Step {Math.floor(demo1CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence1}
            currentStep={demo1CurrentStep}
            {darkMode}
            variant="minimal"
            showLabels={false}
            onSeek={handleSeek1}
          />
        </div>
      </div>
    </div>

    <!-- Demo 2: Raised -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Raised</h2>
        <p>3D appearance with shadows</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>6 steps, equal duration</span>
          <span class="step-indicator">Step {Math.floor(demo2CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence2}
            currentStep={demo2CurrentStep}
            {darkMode}
            variant="raised"
            showLabels={false}
            onSeek={handleSeek2}
          />
        </div>
      </div>
    </div>

    <!-- Demo 3: Rounded -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Rounded</h2>
        <p>Pill-shaped segments with gaps</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>Fast-slow-fast pattern</span>
          <span class="step-indicator">Step {Math.floor(demo3CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence3}
            currentStep={demo3CurrentStep}
            {darkMode}
            variant="rounded"
            showLabels={false}
            onSeek={handleSeek3}
          />
        </div>
      </div>
    </div>

    <!-- Demo 4: Neon -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Neon</h2>
        <p>Glowing segments with animation</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>A (1s), B (2s), C (0.5s), D (1.5s)</span>
          <span class="step-indicator">Step {Math.floor(demo4CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence1}
            currentStep={demo4CurrentStep}
            {darkMode}
            variant="neon"
            showLabels={false}
            onSeek={handleSeek4}
          />
        </div>
      </div>
    </div>

    <!-- Demo 5: Gradient -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Gradient</h2>
        <p>Smooth gradient fills across segments</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>6 steps, equal duration</span>
          <span class="step-indicator">Step {Math.floor(demo5CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence2}
            currentStep={demo5CurrentStep}
            {darkMode}
            variant="gradient"
            showLabels={false}
            onSeek={handleSeek5}
          />
        </div>
      </div>
    </div>

    <!-- Demo 6: Labeled -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Labeled</h2>
        <p>Shows step letters with clear dividers</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>Fast-slow-fast pattern</span>
          <span class="step-indicator">Step {Math.floor(demo6CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence3}
            currentStep={demo6CurrentStep}
            {darkMode}
            variant="labeled"
            showLabels={true}
            onSeek={handleSeek6}
          />
        </div>
      </div>
    </div>

    <!-- Demo 7: Gradient-Labeled (Hybrid) -->
    <div class="demo-card">
      <div class="demo-header">
        <h2>Gradient-Labeled</h2>
        <p>Colorful gradient with labels and dividers</p>
      </div>
      <div class="demo-content">
        <div class="sequence-info">
          <span>6 steps, equal duration</span>
          <span class="step-indicator">Step {Math.floor(demo7CurrentStep) + 1}</span>
        </div>
        <div class="progress-wrapper">
          <SegmentedSequenceProgressBar
            steps={mockSequence2}
            currentStep={demo7CurrentStep}
            {darkMode}
            variant="gradient-labeled"
            showLabels={true}
            onSeek={handleSeek7}
          />
        </div>
      </div>
    </div>
  </div>

  <div class="features-section">
    <h2>Features</h2>
    <div class="features-grid">
      <div class="feature">
        <div class="icon">📊</div>
        <h3>Duration-Aware</h3>
        <p>Each segment width reflects beat duration - see the rhythm visually</p>
      </div>

      <div class="feature">
        <div class="icon">🎯</div>
        <h3>Interactive Scrubbing</h3>
        <p>Click or drag to navigate - instantly jump to any step</p>
      </div>

      <div class="feature">
        <div class="icon">⌨️</div>
        <h3>Keyboard Navigation</h3>
        <p>Arrow keys, Home, End - fully accessible</p>
      </div>

      <div class="feature">
        <div class="icon">🎨</div>
        <h3>7 Visual Styles</h3>
        <p>From minimal to gradient-labeled - find your favorite</p>
      </div>

      <div class="feature">
        <div class="icon">🌓</div>
        <h3>Dark Mode</h3>
        <p>Automatically adapts colors for light and dark themes</p>
      </div>

      <div class="feature">
        <div class="icon">♿</div>
        <h3>WCAG AAA</h3>
        <p>Screen reader support, reduced motion - everyone included</p>
      </div>
    </div>
  </div>

  <div class="instructions">
    <h2>Try It Out</h2>
    <ul>
      <li><strong>Click</strong> any segment to jump to that step</li>
      <li><strong>Drag</strong> across the progress bar to scrub through</li>
      <li><strong>Keyboard:</strong> Arrow keys to step, Home/End to jump</li>
      <li><strong>Notice:</strong> Segment widths match beat durations</li>
    </ul>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 2rem;
    background: linear-gradient(135deg, #0f0f14 0%, #1a1a2e 100%);
    color: #ffffff;
  }

  .header {
    text-align: center;
    margin-bottom: 3rem;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    font-size: 1.1rem;
    color: #94a3b8;
    margin: 0 0 1.5rem 0;
  }

  .controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1.5rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #00b8b8 0%, #00e5e5 100%);
    color: white;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  button:hover {
    transform: scale(1.05);
  }

  button:active {
    transform: scale(0.98);
  }

  .demos-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
    margin-bottom: 3rem;
  }

  .demo-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
  }

  .demo-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.4);
  }

  .demo-header h2 {
    margin: 0 0 0.25rem 0;
    font-size: 1.5rem;
    color: #f1f5f9;
  }

  .demo-header p {
    margin: 0;
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .demo-content {
    margin-top: 1rem;
  }

  .sequence-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
    color: #cbd5e1;
  }

  .step-indicator {
    font-weight: 600;
    color: #00b8b8;
  }

  .progress-wrapper {
    background: rgba(15, 15, 20, 0.98);
    border-radius: 8px;
    overflow: hidden;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
  }

  .features-section {
    margin: 4rem 0;
  }

  .features-section h2 {
    text-align: center;
    font-size: 2rem;
    margin-bottom: 2rem;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
  }

  .feature {
    text-align: center;
  }

  .icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  .feature h3 {
    font-size: 1.25rem;
    margin: 0.5rem 0;
  }

  .feature p {
    color: #94a3b8;
    margin: 0;
  }

  .instructions {
    background: rgba(0, 184, 184, 0.1);
    border-left: 4px solid #00b8b8;
    padding: 1.5rem;
    border-radius: 8px;
    margin: 3rem 0;
  }

  .instructions h2 {
    margin-top: 0;
  }

  .instructions ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .instructions li {
    margin: 0.5rem 0;
  }

  @media (max-width: 768px) {
    .demos-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
