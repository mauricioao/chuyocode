/**
 * `useAudioMarkerPlayback` — "only one plays at a time" for a worksheet's
 * audio markers (practice player, presentation overview). One shared
 * `<audio>` element per caller, re-pointed to whichever marker was last
 * tapped: starting a second marker implicitly stops whatever the first one
 * was playing, and the element's own `ended` event clears `playingId` so the
 * round button reverts to its "play" icon on its own, with no caller-side
 * polling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAudioMarkerPlaybackResult {
  /** The marker id currently playing, or `null` when nothing is. */
  playingId: string | null;
  /** Play `id`'s audio at `resolveUrl(path)`, or pause it if it is already the one playing. */
  toggle: (id: string, path: string) => void;
}

export function useAudioMarkerPlayback(resolveUrl: (path: string) => string): UseAudioMarkerPlaybackResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current && typeof Audio !== 'undefined') {
      const audio = new Audio();
      audio.addEventListener('ended', () => setPlayingId(null));
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  const toggle = useCallback(
    (id: string, path: string) => {
      const audio = ensureAudio();
      if (!audio) return;
      if (playingId === id) {
        audio.pause();
        setPlayingId(null);
        return;
      }
      audio.src = resolveUrl(path);
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Autoplay/decoding can legitimately reject (e.g. a browser policy,
        // or the signed URL having since expired) — the button simply stays
        // on "play" rather than throwing through the click handler.
        setPlayingId((current) => (current === id ? null : current));
      });
      setPlayingId(id);
    },
    [ensureAudio, playingId, resolveUrl],
  );

  // Pauses and releases the audio element when the caller (a worksheet tab,
  // a presentation slide) unmounts — never leaves sound playing behind a
  // view the learner has already left.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  return { playingId, toggle };
}
