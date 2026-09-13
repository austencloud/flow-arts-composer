/**
 * Metronome
 *
 * Provides metronome functionality using Web Audio API.
 * Creates click sounds synced with beat progression timing.
 *
 * Scheduling model: a 25ms polling timer queues clicks onto the audio clock up
 * to `scheduleAheadTime` in the future, which is what keeps the beat grid free
 * of `setTimeout` jitter. The cost of a lookahead is that "now" and "already
 * committed" are different things — stopping has to reach the clicks and beat
 * callbacks that were queued for a future that is no longer going to happen.
 */

/** Length of a single click's envelope. */
const CLICK_DURATION_SECONDS = 0.05;

/** How often the lookahead scheduler wakes up to top up the queue. */
const SCHEDULER_POLL_MS = 25;

/** One queued click and the graph nodes that have to be released with it. */
interface ScheduledClick {
  oscillator: OscillatorNode;
  gain: GainNode;
  startTime: number;
  endTime: number;
}

export class Metronome {
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private nextClickTime: number = 0;
  private scheduleAheadTime: number = 0.1; // Schedule clicks 100ms ahead
  private timerID: number | null = null;
  /** Clicks committed to the audio clock but not finished sounding yet. */
  private scheduledClicks: ScheduledClick[] = [];
  /** Beat-callback timeouts already queued by the lookahead. */
  private pendingCallbacks: number[] = [];

  constructor() {
    // Initialize AudioContext on first user interaction
    // (browsers require user gesture before audio can play)
  }

  /**
   * Initialize audio context if not already initialized.
   * Construction can throw (unsupported browser, exhausted audio resources),
   * so failures leave audioContext null for the caller to detect.
   */
  private initializeAudioContext(): void {
    if (!this.audioContext) {
      try {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.audioContext = new AudioContextConstructor();
      } catch (err) {
        console.error("Failed to construct audio context:", err);
        this.audioContext = null;
      }
    }
  }

  /**
   * Create a metronome click sound
   */
  private createClick(time: number, isAccent: boolean = false): void {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Accented beat (first beat) vs regular beat
    if (isAccent) {
      oscillator.frequency.value = 1200; // Higher pitch for accented beat
      gainNode.gain.value = 0.3;
    } else {
      oscillator.frequency.value = 800; // Regular pitch
      gainNode.gain.value = 0.2;
    }

    // Short click sound
    oscillator.start(time);
    oscillator.stop(time + CLICK_DURATION_SECONDS);

    // Fade out to avoid clicking
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      time + CLICK_DURATION_SECONDS
    );

    this.scheduledClicks.push({
      oscillator,
      gain: gainNode,
      startTime: time,
      endTime: time + CLICK_DURATION_SECONDS,
    });
  }

  /**
   * Drop clicks that have finished sounding. Without this the tracking list —
   * and the audio graph behind it — would grow by one node pair per beat for
   * as long as the metronome runs.
   */
  private releaseFinishedClicks(now: number): void {
    if (this.scheduledClicks.length === 0) return;

    const stillLive: ScheduledClick[] = [];
    for (const click of this.scheduledClicks) {
      if (click.endTime <= now) {
        click.oscillator.disconnect();
        click.gain.disconnect();
      } else {
        stillLive.push(click);
      }
    }
    this.scheduledClicks = stillLive;
  }

  /**
   * Silence everything the lookahead committed to but that has not started
   * yet. Per the Web Audio spec an oscillator whose stop time precedes its
   * start time never sounds at all, so re-stopping at "now" cancels it.
   */
  private cancelScheduledClicks(): void {
    const now = this.audioContext?.currentTime ?? 0;

    for (const click of this.scheduledClicks) {
      if (click.startTime > now) {
        try {
          click.oscillator.stop(now);
        } catch {
          // Already stopped or the context went away; nothing left to cancel.
        }
        click.oscillator.disconnect();
        click.gain.disconnect();
      } else {
        // Mid-click: cutting it here would pop, so let the 50ms envelope
        // finish and release the nodes when it does.
        click.oscillator.onended = () => {
          click.oscillator.disconnect();
          click.gain.disconnect();
        };
      }
    }

    this.scheduledClicks = [];
  }

  /**
   * Start the metronome
   * @param bpm - Beats per minute
   * @param onStep - Callback called on each beat with beat index
   * @returns false when the audio context could not be initialized, so the
   *          caller can surface the failure to the user; true otherwise.
   */
  start(bpm: number, onStep?: (stepNumber: number) => void): boolean {
    // A restart — tempo change, stop/play, a second play tap — must replace
    // the running scheduler, not race it. Two loops share `nextClickTime`, so
    // they interleave onto one corrupted grid, and only the newer loop's timer
    // is reachable from stop(): the older one would click forever.
    this.stop();

    this.initializeAudioContext();

    if (!this.audioContext) {
      console.error("Failed to initialize audio context");
      return false;
    }

    // A context created outside a user gesture — or auto-suspended by the
    // browser while the tab was hidden — has a frozen currentTime. The
    // scheduler would poll forever without the beat grid ever advancing.
    this.resume();

    const beatsPerSecond = bpm / 60;
    const secondsPerBeat = 1 / beatsPerSecond;

    this.nextClickTime = this.audioContext.currentTime;
    let stepIndex = 0;

    const scheduler = () => {
      if (!this.audioContext) return;

      this.releaseFinishedClicks(this.audioContext.currentTime);

      // Schedule clicks ahead of time
      while (
        this.nextClickTime <
        this.audioContext.currentTime + this.scheduleAheadTime
      ) {
        if (this.isEnabled) {
          // Accent every 4th beat (typical measure)
          const isAccent = stepIndex % 4 === 0;
          this.createClick(this.nextClickTime, isAccent);
        }

        if (onStep) {
          // Schedule callback at the same time as the click. Capture the beat
          // this pass is scheduling: `stepIndex` has already moved on by the
          // time the timeout fires, so reading it there reports the wrong beat.
          const beat = stepIndex;
          const callbackDelay =
            (this.nextClickTime - this.audioContext.currentTime) * 1000;
          const callbackID = window.setTimeout(() => {
            this.pendingCallbacks = this.pendingCallbacks.filter(
              (id) => id !== callbackID
            );
            onStep(beat);
          }, Math.max(0, callbackDelay));
          this.pendingCallbacks.push(callbackID);
        }

        this.nextClickTime += secondsPerBeat;
        stepIndex++;
      }

      this.timerID = window.setTimeout(scheduler, SCHEDULER_POLL_MS);
    };

    scheduler();
    return true;
  }

  /**
   * Lazily create and resume the AudioContext. Browsers only unlock audio
   * inside a user gesture, so callers invoke this from a click handler.
   */
  resume(): void {
    this.initializeAudioContext();
    if (this.audioContext?.state === "suspended") {
      // resume() rejects on a closed context; degrade quietly rather than
      // surfacing an unhandled rejection.
      this.audioContext.resume().catch((err) => {
        console.warn("Failed to resume audio context:", err);
      });
    }
  }

  /**
   * Play a single click immediately. For callers that drive their own beat
   * timing (e.g. the viewer's ramp playback) rather than this class's internal
   * scheduler. No-ops when audio is unavailable. Accent = the higher/louder
   * click used for a measure's first beat.
   */
  tick(isAccent = false): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    // No scheduler runs on this path, so each tick releases the previous one.
    this.releaseFinishedClicks(now);
    this.createClick(now, isAccent);
  }

  /**
   * Stop the metronome. Cancels the polling loop and everything the lookahead
   * already committed: queued clicks and queued beat callbacks both outlive a
   * stop that only clears the timer.
   */
  stop(): void {
    if (this.timerID !== null) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }

    for (const callbackID of this.pendingCallbacks) {
      window.clearTimeout(callbackID);
    }
    this.pendingCallbacks = [];

    this.cancelScheduledClicks();
  }

  /**
   * Enable or disable metronome sound
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if metronome is enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
