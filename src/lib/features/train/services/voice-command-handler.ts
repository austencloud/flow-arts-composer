/**
 * VoiceCommandHandler - Voice Recognition Implementation
 *
 * Uses Web Speech API for voice command detection.
 * Primarily for Step-by-Step mode advancement.
 */

import { browser } from "$app/env";
// Augment Window interface for webkit prefixed SpeechRecognition
interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

export class VoiceCommandHandler {
  private recognition: SpeechRecognition | null = null;
  private listening = false;
  private currentKeyword = "";
  private currentCallback: (() => void) | null = null;

  constructor() {
    // Skip during SSR - no window available
    if (!browser) {
      return;
    }

    // Check for browser support - use the global SpeechRecognition or webkit prefix
    const win = window as WindowWithSpeechRecognition;
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRecognitionCtor) {
      this.recognition = new SpeechRecognitionCtor();
      this.setupRecognition();
    }
  }

  private setupRecognition(): void {
    if (!this.recognition) return;

    // Configure recognition
    this.recognition.continuous = true; // Keep listening
    this.recognition.interimResults = false; // Only final results
    this.recognition.lang = "en-US";
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      const lastResultIndex = event.results.length - 1;
      const result = event.results[lastResultIndex];
      if (result?.[0]) {
        const transcript = result[0].transcript.trim().toLowerCase();

        // Check if transcript contains the keyword
        if (
          this.currentKeyword &&
          transcript.includes(this.currentKeyword.toLowerCase())
        ) {
          this.currentCallback?.();
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error("[VoiceCommandHandler] Error:", event.error);

      // Auto-restart on certain errors
      if (event.error === "no-speech" || event.error === "audio-capture") {
        this.restart();
      }
    };

    // Auto-restart when recognition ends
    this.recognition.onend = () => {
      if (this.listening) {
        this.restart();
      }
    };
  }

  private restart(): void {
    if (!this.recognition || !this.listening) return;

    try {
      this.recognition.start();
    } catch (error) {
      // Recognition might already be starting
      console.warn("[VoiceCommandHandler] Restart failed:", error);
    }
  }

  startListening(keyword: string, callback: () => void): void {
    if (!this.isSupported()) {
      console.warn("[VoiceCommandHandler] Speech recognition not supported");
      return;
    }

    if (this.listening) {
      this.stopListening();
    }

    this.currentKeyword = keyword;
    this.currentCallback = callback;
    this.listening = true;

    try {
      this.recognition?.start();
    } catch (error) {
      console.error("[VoiceCommandHandler] Failed to start:", error);
      this.listening = false;
    }
  }

  stopListening(): void {
    if (!this.recognition || !this.listening) return;

    this.listening = false;
    this.currentKeyword = "";
    this.currentCallback = null;

    try {
      this.recognition.stop();
    } catch (error) {
      console.warn("[VoiceCommandHandler] Stop failed:", error);
    }
  }

  isSupported(): boolean {
    if (!browser) {
      return false;
    }
    const win = window as WindowWithSpeechRecognition;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  isListening(): boolean {
    return this.listening;
  }
}
