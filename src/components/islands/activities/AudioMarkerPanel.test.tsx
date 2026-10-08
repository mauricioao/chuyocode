// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { uploadAudioBlobMock, recorderState, recorderMocks } = vi.hoisted(() => ({
  uploadAudioBlobMock: vi.fn(),
  recorderState: { current: { kind: 'idle' } as Record<string, unknown> },
  recorderMocks: { start: vi.fn(), stop: vi.fn(), discard: vi.fn() },
}));

vi.mock('@/lib/activities/audioUpload', () => ({
  uploadAudioBlob: uploadAudioBlobMock,
}));

vi.mock('@/lib/activities/useAudioRecorder', () => ({
  MAX_RECORDING_SECONDS: 120,
  useAudioRecorder: () => ({
    state: recorderState.current,
    start: recorderMocks.start,
    stop: recorderMocks.stop,
    discard: recorderMocks.discard,
  }),
}));

import AudioMarkerPanel from './AudioMarkerPanel';

const MARKER = { id: 'a1', x: 0.2, y: 0.3, path: 'activity-audio-uploads/u/a.webm' };

function resolveAudioUrl(path: string) {
  return `/api/actividades/audio?path=${encodeURIComponent(path)}`;
}

beforeEach(() => {
  uploadAudioBlobMock.mockReset();
  recorderState.current = { kind: 'idle' };
  recorderMocks.start.mockReset();
  recorderMocks.stop.mockReset();
  recorderMocks.discard.mockReset();
});

describe('AudioMarkerPanel — new placement (marker=null)', () => {
  it('shows the upload/record choice, with no delete button', () => {
    render(
      <AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onCancelPlacement={vi.fn()} />,
    );
    expect(screen.getByTestId('audio-upload-trigger')).toBeTruthy();
    expect(screen.getByTestId('audio-record-trigger')).toBeTruthy();
    expect(screen.queryByTestId('audio-delete')).toBeNull();
  });

  it('uploads a picked file and calls onAudioReady with the resulting path', async () => {
    uploadAudioBlobMock.mockResolvedValue({ ok: true, path: 'activity-audio-uploads/u/new.webm' });
    const onAudioReady = vi.fn();
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={onAudioReady} />);

    const file = new File(['x'], 'a.webm', { type: 'audio/webm' });
    fireEvent.change(screen.getByTestId('audio-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(onAudioReady).toHaveBeenCalledWith('activity-audio-uploads/u/new.webm'));
    expect(uploadAudioBlobMock).toHaveBeenCalledWith(file);
  });

  it('shows an error and never calls onAudioReady when the upload fails', async () => {
    uploadAudioBlobMock.mockResolvedValue({ ok: false, error: 'payload_too_large' });
    const onAudioReady = vi.fn();
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={onAudioReady} />);

    const file = new File(['x'], 'a.webm', { type: 'audio/webm' });
    fireEvent.change(screen.getByTestId('audio-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('audio-error')).toBeTruthy());
    expect(onAudioReady).not.toHaveBeenCalled();
  });

  it('cancelling the placement calls onCancelPlacement', () => {
    const onCancelPlacement = vi.fn();
    render(
      <AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onCancelPlacement={onCancelPlacement} />,
    );
    fireEvent.click(screen.getByTestId('audio-cancel'));
    expect(onCancelPlacement).toHaveBeenCalledTimes(1);
  });

  it('pressing Grabar starts the recorder (no mic access before that)', () => {
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    expect(recorderMocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    expect(recorderMocks.start).toHaveBeenCalledTimes(1);
  });

  it('shows the live timer while recording', () => {
    recorderState.current = { kind: 'recording', seconds: 7 };
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    expect(screen.getByTestId('audio-recording-timer').textContent).toContain('0:07');
  });

  it('Detener calls the recorder\'s own stop()', () => {
    recorderState.current = { kind: 'recording', seconds: 3 };
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    fireEvent.click(screen.getByTestId('audio-stop-recording'));
    expect(recorderMocks.stop).toHaveBeenCalledTimes(1);
  });

  it('once recorded, "Usar" uploads the blob and calls onAudioReady', async () => {
    const blob = new Blob(['x'], { type: 'audio/webm' });
    recorderState.current = { kind: 'recorded', blob, url: 'blob:fake', seconds: 5 };
    uploadAudioBlobMock.mockResolvedValue({ ok: true, path: 'activity-audio-uploads/u/rec.webm' });
    const onAudioReady = vi.fn();
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={onAudioReady} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));

    expect(screen.getByTestId('audio-recorded-preview').getAttribute('src')).toBe('blob:fake');
    fireEvent.click(screen.getByTestId('audio-use-recording'));

    await waitFor(() => expect(onAudioReady).toHaveBeenCalledWith('activity-audio-uploads/u/rec.webm'));
    expect(uploadAudioBlobMock).toHaveBeenCalledWith(blob);
  });

  it('"Grabar de nuevo" discards and restarts the recorder', () => {
    recorderState.current = { kind: 'recorded', blob: new Blob(), url: 'blob:fake', seconds: 5 };
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    fireEvent.click(screen.getByTestId('audio-record-again'));
    expect(recorderMocks.discard).toHaveBeenCalledTimes(1);
    expect(recorderMocks.start).toHaveBeenCalledTimes(2);
  });

  it('shows a permission-denied message', () => {
    recorderState.current = { kind: 'permission-denied' };
    render(<AudioMarkerPanel lang="es" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    expect(screen.getByText(/micrófono/i)).toBeTruthy();
  });

  it('shows an unsupported-browser message', () => {
    recorderState.current = { kind: 'unsupported' };
    render(<AudioMarkerPanel lang="en" marker={null} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-record-trigger'));
    expect(screen.getByText(/cannot record audio/i)).toBeTruthy();
  });
});

describe('AudioMarkerPanel — existing marker', () => {
  it('shows a listen-back <audio> resolved through resolveAudioUrl, and the drag hint', () => {
    render(<AudioMarkerPanel lang="es" marker={MARKER} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onDelete={vi.fn()} />);
    const audio = screen.getByTestId('audio-marker-player');
    expect(audio.getAttribute('src')).toBe(resolveAudioUrl(MARKER.path));
    expect(screen.getByText(/arrastra/i)).toBeTruthy();
  });

  it('shows a delete button, which calls onDelete', () => {
    const onDelete = vi.fn();
    render(<AudioMarkerPanel lang="es" marker={MARKER} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('audio-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('"Reemplazar audio" switches to the upload/record choice', () => {
    render(<AudioMarkerPanel lang="es" marker={MARKER} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-replace'));
    expect(screen.getByTestId('audio-upload-trigger')).toBeTruthy();
  });

  it('replacing and then uploading calls onAudioReady with the NEW path, never touching onDelete', async () => {
    uploadAudioBlobMock.mockResolvedValue({ ok: true, path: 'activity-audio-uploads/u/replacement.webm' });
    const onAudioReady = vi.fn();
    const onDelete = vi.fn();
    render(<AudioMarkerPanel lang="es" marker={MARKER} resolveAudioUrl={resolveAudioUrl} onAudioReady={onAudioReady} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('audio-replace'));
    const file = new File(['x'], 'a.webm', { type: 'audio/webm' });
    fireEvent.change(screen.getByTestId('audio-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(onAudioReady).toHaveBeenCalledWith('activity-audio-uploads/u/replacement.webm'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('cancelling a replace returns to the listen view', () => {
    render(<AudioMarkerPanel lang="es" marker={MARKER} resolveAudioUrl={resolveAudioUrl} onAudioReady={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('audio-replace'));
    fireEvent.click(screen.getByTestId('audio-cancel'));
    expect(screen.getByTestId('audio-marker-player')).toBeTruthy();
  });
});
