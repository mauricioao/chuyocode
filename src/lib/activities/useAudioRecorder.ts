/**
 * `useAudioRecorder` — the editor's own microphone recording state machine
 * ("colocar un audio propio": record an audio marker in place, instead of
 * only uploading a file). Owns `getUserMedia`/`MediaRecorder` directly so
 * `AudioMarkerPanel.tsx` (the UI) stays a plain state-machine renderer with
 * no browser API calls of its own — easy to test independently of real
 * microphone/recorder behavior (mocked in this file's own tests).
 *
 * `getUserMedia` is requested ONLY on calling {@link start} — never on
 * mount/render — matching the owner's explicit instruction: a worksheet
 * tool must never prompt for microphone access before the author actually
 * presses "Grabar".
 *
 * Feature-detected via `MediaRecorder.isTypeSupported`, never a hardcoded
 * mime type: `audio/webm;codecs=opus` first (every Chromium/Firefox
 * desktop/Android browser), `audio/webm` next, then `audio/mp4` (Safari,
 * which has no WebM `MediaRecorder` support at all) — the first one the
 * CURRENT browser actually reports as supported. A browser offering none of
 * these (or lacking `MediaRecorder`/`getUserMedia` entirely) surfaces as the
 * `'unsupported'` state rather than throwing.
 *
 * AUTO-STOPS at {@link MAX_RECORDING_SECONDS} (2 minutes, owner-proposed
 * limit) — a `setInterval` ticks the elapsed time once a second and calls
 * {@link stop} itself once the cap is reached, exactly as if the author had
 * pressed "Detener".
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Max recording length (owner-proposed limit, named so it is easy to change) — mirrors the editor's own UI copy and the moderation/upload pipeline's own duration expectations. */
export const MAX_RECORDING_SECONDS = 120;

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

/** The first mime type THIS browser actually supports, or `null` if none of them (or `MediaRecorder` itself) exist. */
function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export type AudioRecorderState =
  | { kind: 'idle' }
  | { kind: 'requesting-permission' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'recorded'; blob: Blob; url: string; seconds: number }
  | { kind: 'permission-denied' }
  | { kind: 'unsupported' }
  | { kind: 'error' };

export interface UseAudioRecorderResult {
  state: AudioRecorderState;
  /** Requests microphone access and starts recording. No-op while already requesting/recording. */
  start: () => Promise<void>;
  /** Stops an in-progress recording, transitioning to `'recorded'`. No-op outside the `'recording'` state. */
  stop: () => void;
  /** Discards a `'recorded'` blob (revoking its object URL) and returns to `'idle'` — "Grabar de nuevo". No-op from any other state. */
  discard: () => void;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<AudioRecorderState>({ kind: 'idle' });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('');

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setState((prev) => {
      if (prev.kind === 'requesting-permission' || prev.kind === 'recording') return prev;
      return prev;
    });
    // Re-read synchronously too — the state updater above is for a
    // double-call during the SAME tick; a genuinely concurrent call still
    // reads this ref-free guard via `mediaRecorderRef`/`streamRef` below.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;

    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
      setState({ kind: 'unsupported' });
      return;
    }
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setState({ kind: 'unsupported' });
      return;
    }

    setState({ kind: 'requesting-permission' });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ kind: 'permission-denied' });
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setState({ kind: 'error' });
      return;
    }

    streamRef.current = stream;
    mediaRecorderRef.current = recorder;
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTimer();
      releaseStream();
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const url = URL.createObjectURL(blob);
      const seconds = Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - startTimeRef.current) / 1000));
      setState({ kind: 'recorded', blob, url, seconds });
    };
    recorder.onerror = () => {
      clearTimer();
      releaseStream();
      setState({ kind: 'error' });
    };

    startTimeRef.current = Date.now();
    recorder.start();
    setState({ kind: 'recording', seconds: 0 });

    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setState((prev) => (prev.kind === 'recording' ? { kind: 'recording', seconds: elapsed } : prev));
      if (elapsed >= MAX_RECORDING_SECONDS) stop();
    }, 1000);
  }, [clearTimer, releaseStream, stop]);

  const discard = useCallback(() => {
    setState((prev) => {
      if (prev.kind === 'recorded') URL.revokeObjectURL(prev.url);
      return { kind: 'idle' };
    });
  }, []);

  // Unmount safety net: release the microphone and any pending object URL
  // if the panel closes mid-recording/mid-listen-back.
  useEffect(
    () => () => {
      clearTimer();
      releaseStream();
      mediaRecorderRef.current = null;
      setState((prev) => {
        if (prev.kind === 'recorded') URL.revokeObjectURL(prev.url);
        return prev;
      });
    },
    [clearTimer, releaseStream],
  );

  return { state, start, stop, discard };
}
