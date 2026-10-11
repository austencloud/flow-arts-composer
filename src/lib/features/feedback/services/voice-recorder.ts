import type { VoiceRecordingResult } from "#lib/shared/feedback/domain/feedback-contract-types.js";

const MAX_DURATION_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Preferred MIME types in order. Chrome/Firefox support webm/opus,
 * Safari only supports mp4/aac.
 */
const MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
] as const;

/**
 * Records audio via getUserMedia + MediaRecorder.
 *
 * Tries webm/opus first (small files, fast upload), falls back to
 * mp4 for Safari. Automatically stops after MAX_DURATION_MS.
 */
export class VoiceRecorder {
	private recorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];
	private startTime = 0;
	private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
	private resolveStop: ((result: VoiceRecordingResult) => void) | null = null;
	private selectedMimeType = "";

	get isRecording(): boolean {
		return this.recorder?.state === "recording";
	}

	get elapsedMs(): number {
		if (!this.startTime || !this.isRecording) return 0;
		return Date.now() - this.startTime;
	}

	async start(): Promise<MediaStream> {
		if (this.isRecording) {
			throw new Error("Already recording");
		}

		this.cleanup();

		// Request microphone access
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});

		this.stream = stream;

		// Pick the best supported MIME type
		this.selectedMimeType = this.pickMimeType();

		const options: MediaRecorderOptions = {};
		if (this.selectedMimeType) {
			options.mimeType = this.selectedMimeType;
		}

		const recorder = new MediaRecorder(stream, options);

		// If no explicit mimeType was set, capture what MediaRecorder chose
		if (!this.selectedMimeType) {
			this.selectedMimeType = recorder.mimeType;
		}

		this.chunks = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				this.chunks.push(event.data);
			}
		};

		recorder.onstop = () => {
			this.finalizeRecording();
		};

		recorder.start();
		this.recorder = recorder;
		this.startTime = Date.now();

		// Auto-stop safety net
		this.autoStopTimer = setTimeout(() => {
			if (this.isRecording) {
				this.recorder?.stop();
			}
		}, MAX_DURATION_MS);

		return stream;
	}

	stop(): Promise<VoiceRecordingResult> {
		return new Promise((resolve, reject) => {
			if (this.recorder?.state !== "recording") {
				reject(new Error("Not recording"));
				return;
			}

			this.resolveStop = resolve;
			this.recorder.stop();
		});
	}

	cancel(): void {
		if (this.recorder?.state === "recording") {
			// Clear the onstop handler so finalizeRecording doesn't fire
			this.recorder.onstop = null;
			this.recorder.stop();
		}
		this.cleanup();
	}

	private finalizeRecording(): void {
		const durationMs = this.startTime ? Date.now() - this.startTime : 0;
		const blob = new Blob(this.chunks, { type: this.selectedMimeType });
		const mimeType = this.selectedMimeType;

		const resolve = this.resolveStop;
		this.cleanup();

		if (resolve) {
			resolve({ blob, mimeType, durationMs });
		}
	}

	private cleanup(): void {
		if (this.autoStopTimer) {
			clearTimeout(this.autoStopTimer);
			this.autoStopTimer = null;
		}

		// Stop all mic tracks to release the hardware
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				track.stop();
			}
			this.stream = null;
		}

		this.recorder = null;
		this.chunks = [];
		this.startTime = 0;
		this.resolveStop = null;
	}

	private pickMimeType(): string {
		if (typeof MediaRecorder.isTypeSupported !== "function") {
			return ""; // Let the browser choose
		}

		for (const candidate of MIME_CANDIDATES) {
			if (MediaRecorder.isTypeSupported(candidate)) {
				return candidate;
			}
		}

		return ""; // Fallback: let MediaRecorder pick its default
	}
}
