/** Pure helpers for browser speech recognition, kept apart from the hook so they can be unit-tested. */

type Alternatives = ArrayLike<{ transcript: string }>;

/**
 * Join the transcript of every result in a (continuous) recognition session.
 * Chrome pads later results with a leading space, so each piece is trimmed first.
 */
export function joinTranscript(results: ArrayLike<Alternatives>): string {
  return Array.from(results, (r) => (r[0]?.transcript ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** User-facing message for a SpeechRecognition error code. `null` means stay quiet (the user stopped it). */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
    case "no-speech":
      return "Didn't hear anything. Try again a little closer to the microphone.";
    case "audio-capture":
      return "No microphone found. Plug one in or type it instead.";
    case "network":
      return "Voice input needs an internet connection here. Type it instead.";
    case "language-not-supported":
      return "This browser can't recognise your language by voice. Type it instead.";
    default:
      return "Voice input stopped unexpectedly. Try again or type it instead.";
  }
}
