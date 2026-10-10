/**
 * Converts a recorded audio Blob to base64 and calls the
 * `transcribeAudio` Cloud Function. Uses dynamic imports to
 * avoid loading Firebase Functions SDK until needed.
 */
export async function transcribe(blob: Blob, mimeType: string): Promise<string> {
	const audioBase64 = await blobToBase64(blob);

	// Dynamic import: only load Firebase Functions SDK when actually transcribing
	const { httpsCallable } = await import("firebase/functions");
	const { getFunctionsInstance } = await import(
		"#lib/shared/auth/firebase.js"
	);

	const functions = await getFunctionsInstance();
	const transcribeAudio = httpsCallable<
		{ audioBase64: string; mimeType: string },
		{ transcript: string }
	>(functions, "transcribeAudio");

	const result = await transcribeAudio({ audioBase64, mimeType });
	return result.data.transcript;
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const dataUrl = reader.result as string;
			// Strip the data URL prefix (e.g. "data:audio/webm;base64,")
			const base64 = dataUrl.split(",")[1];
			if (!base64) {
				reject(new Error("Failed to encode audio as base64"));
				return;
			}
			resolve(base64);
		};
		reader.onerror = () => reject(new Error("Failed to read audio blob"));
		reader.readAsDataURL(blob);
	});
}
