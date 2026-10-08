// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useAudioMarkerPlayback } from './useAudioMarkerPlayback';

const playMock = vi.fn();
const pauseMock = vi.fn();
let audioInstances: HTMLAudioElement[] = [];

beforeEach(() => {
  playMock.mockReset().mockResolvedValue(undefined);
  pauseMock.mockReset();
  audioInstances = [];
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(playMock);
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(pauseMock);
  // `new Audio()` creates a detached element (never appended to `document`)
  // — capture every instance this hook creates so tests can inspect it.
  const RealAudio = window.Audio;
  class CapturingAudio extends RealAudio {
    constructor(...args: ConstructorParameters<typeof RealAudio>) {
      super(...args);
      audioInstances.push(this);
    }
  }
  vi.stubGlobal('Audio', CapturingAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function resolveUrl(path: string) {
  return `/api/actividades/audio?path=${encodeURIComponent(path)}`;
}

describe('useAudioMarkerPlayback', () => {
  it('starts with nothing playing', () => {
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    expect(result.current.playingId).toBeNull();
  });

  it('plays a marker and sets it as the current playingId', async () => {
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'activity-audio/a/x.webm');
    });
    expect(result.current.playingId).toBe('m1');
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('resolves the marker path through the given resolver, as the audio element src', async () => {
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'activity-audio/a/x.webm');
    });
    // jsdom normalizes a relative `src` into an absolute URL — assert the
    // resolved PATH survived into it rather than exact string equality.
    expect(audioInstances[0]?.src).toContain(encodeURIComponent('activity-audio/a/x.webm'));
  });

  it('toggling the SAME marker again pauses it and clears playingId', async () => {
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'p1');
    });
    await act(async () => {
      result.current.toggle('m1', 'p1');
    });
    expect(result.current.playingId).toBeNull();
    expect(pauseMock).toHaveBeenCalledTimes(1);
  });

  it('starting a SECOND marker switches playingId — only one plays at a time', async () => {
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'p1');
    });
    await act(async () => {
      result.current.toggle('m2', 'p2');
    });
    expect(result.current.playingId).toBe('m2');
    // Only one `<audio>` element is ever used — re-pointed, not a second one created.
    expect(audioInstances.length).toBe(1);
  });

  it('a rejected play() clears playingId back without throwing', async () => {
    playMock.mockRejectedValue(new Error('autoplay blocked'));
    const { result } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'p1');
      await Promise.resolve();
    });
    expect(result.current.playingId).toBeNull();
  });

  it('pauses and releases the audio element on unmount', async () => {
    const { result, unmount } = renderHook(() => useAudioMarkerPlayback(resolveUrl));
    await act(async () => {
      result.current.toggle('m1', 'p1');
    });
    unmount();
    expect(pauseMock).toHaveBeenCalled();
  });
});
