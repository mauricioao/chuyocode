// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useAudioRecorder, MAX_RECORDING_SECONDS } from './useAudioRecorder';

type Listener = (e: { data: Blob }) => void;

class FakeMediaRecorder {
  static supportedTypes: string[] = ['audio/webm;codecs=opus', 'audio/webm'];
  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supportedTypes.includes(type);
  }
  static instances: FakeMediaRecorder[] = [];

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: Listener | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    public options: { mimeType: string },
  ) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk']) });
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

const getUserMediaMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supportedTypes = ['audio/webm;codecs=opus', 'audio/webm'];
  getUserMediaMock.mockReset().mockResolvedValue(fakeStream());
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:fake-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useAudioRecorder', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('never requests the microphone before start() is called', () => {
    renderHook(() => useAudioRecorder());
    expect(getUserMediaMock).not.toHaveBeenCalled();
  });

  it('requests the microphone and transitions to recording on start()', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toEqual({ kind: 'recording', seconds: 0 });
  });

  it('picks the first mime type the browser actually supports', async () => {
    FakeMediaRecorder.supportedTypes = ['audio/mp4'];
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(FakeMediaRecorder.instances[0]?.options.mimeType).toBe('audio/mp4');
  });

  it('prefers audio/webm;codecs=opus when supported', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(FakeMediaRecorder.instances[0]?.options.mimeType).toBe('audio/webm;codecs=opus');
  });

  it('transitions to unsupported when MediaRecorder has no type this browser supports', async () => {
    FakeMediaRecorder.supportedTypes = [];
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({ kind: 'unsupported' });
    expect(getUserMediaMock).not.toHaveBeenCalled();
  });

  it('transitions to unsupported when MediaRecorder does not exist at all', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({ kind: 'unsupported' });
  });

  it('transitions to unsupported when getUserMedia does not exist at all', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', { value: undefined, configurable: true });
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({ kind: 'unsupported' });
  });

  it('transitions to permission-denied when getUserMedia rejects', async () => {
    getUserMediaMock.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({ kind: 'permission-denied' });
  });

  it('ticks seconds every second while recording', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.state).toEqual({ kind: 'recording', seconds: 3 });
  });

  it('auto-stops at MAX_RECORDING_SECONDS, transitioning to recorded', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime((MAX_RECORDING_SECONDS + 1) * 1000);
    });
    expect(result.current.state.kind).toBe('recorded');
  });

  it('stop() transitions to recorded with a blob and an object URL', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.state.kind).toBe('recorded');
    if (result.current.state.kind === 'recorded') {
      expect(result.current.state.blob).toBeInstanceOf(Blob);
      expect(result.current.state.url).toBe('blob:fake-url');
    }
  });

  it('stop() releases the microphone stream', async () => {
    const stream = fakeStream();
    getUserMediaMock.mockResolvedValue(stream);
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(stream.getTracks()[0]!.stop).toHaveBeenCalled();
  });

  it('stop() is a no-op outside the recording state', () => {
    const { result } = renderHook(() => useAudioRecorder());
    act(() => {
      result.current.stop();
    });
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('discard() revokes the object URL and returns to idle ("Grabar de nuevo")', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    act(() => {
      result.current.discard();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('discard() is a no-op outside the recorded state', () => {
    const { result } = renderHook(() => useAudioRecorder());
    act(() => {
      result.current.discard();
    });
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('transitions to error when MediaRecorder construction throws', async () => {
    class ThrowingRecorder extends FakeMediaRecorder {
      constructor(stream: MediaStream, options: { mimeType: string }) {
        super(stream, options);
        throw new Error('nope');
      }
    }
    vi.stubGlobal('MediaRecorder', ThrowingRecorder);
    const { result } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toEqual({ kind: 'error' });
  });

  it('releases the microphone on unmount mid-recording', async () => {
    const stream = fakeStream();
    getUserMediaMock.mockResolvedValue(stream);
    const { result, unmount } = renderHook(() => useAudioRecorder());
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(stream.getTracks()[0]!.stop).toHaveBeenCalled();
  });
});
