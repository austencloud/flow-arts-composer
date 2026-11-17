interface SubmissionError {
  error?: unknown;
}

export async function submitSoftware(
  name: string,
  url: string,
  notes: string,
  website = ""
): Promise<void> {
  const response = await fetch("/api/software-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url, notes, website }),
  });

  if (response.ok) return;

  let message = "That submission couldn't be sent. Please try again.";

  try {
    const body = (await response.json()) as SubmissionError;
    if (typeof body.error === "string" && body.error) message = body.error;
  } catch {
    // The fallback already tells the visitor what they can do next.
  }

  throw new Error(message);
}
