/**
 * `splitSentences` — splits speakable English text into sentence-sized
 * chunks so `useSpeech` can queue one `SpeechSynthesisUtterance` per
 * sentence instead of a single long one.
 *
 * Chrome silently stalls an in-flight utterance around ~15 seconds of
 * speech (see `useSpeech`'s own keep-alive workaround for the companion
 * fix). Queuing shorter utterances keeps each one comfortably under that
 * ceiling for ordinary exercise-length prose, while still reading as one
 * continuous pass (each utterance's `onend` starts the next).
 *
 * Splits on `.`, `!`, `?` followed by whitespace or end of string, keeping
 * the terminator attached to its sentence. Falls back to the whole
 * (trimmed) input as one chunk when nothing looks like a sentence boundary.
 * Never returns an empty array for non-empty input, and never returns a
 * whitespace-only chunk.
 */
const SENTENCE_RE = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;

export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const matches = trimmed.match(SENTENCE_RE);
  if (!matches) return [trimmed];

  const sentences = matches.map((s) => s.trim()).filter((s) => s.length > 0);
  return sentences.length > 0 ? sentences : [trimmed];
}
