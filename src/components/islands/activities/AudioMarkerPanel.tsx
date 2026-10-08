/**
 * AudioMarkerPanel — the properties-panel content for one worksheet audio
 * marker ("colocar un audio propio"), rendered by `WorksheetZoneEditor.tsx`
 * in the SAME desktop overlay/mobile BottomSheet slot a zone's own
 * properties use (mutually exclusive with it — see that file's own
 * header), never a separate floating popover: reusing that chrome means
 * this panel inherits its positioning and mobile behavior for free.
 *
 * TWO MODES, driven by `marker`:
 *  - `marker === null` — a brand-new placement (the author just clicked the
 *    canvas with the Audio tool): "Subir archivo" / "Grabar", with no
 *    marker added to the block's `audio` array until one of them actually
 *    succeeds (see `blocks.ts`'s own `AudioMarker` header on why).
 *  - `marker` given — an already-placed marker: listen-back
 *    (`<audio controls>`, same signed-URL treatment as the moderation
 *    preview), "Reemplazar audio" (re-opens the same upload/record choice),
 *    and "Eliminar audio".
 *
 * Recording uses `useAudioRecorder` directly — this component is the one
 * place that state machine's states become UI (permission/timer/listen-
 * back/retry), so `WorksheetZoneEditor.tsx` itself stays unaware of
 * `getUserMedia`/`MediaRecorder` entirely.
 */
import { useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { AudioMarker } from '@/lib/activities/blocks';
import { uploadAudioBlob } from '@/lib/activities/audioUpload';
import { useAudioRecorder, MAX_RECORDING_SECONDS } from '@/lib/activities/useAudioRecorder';
import { Button } from '@/components/ui/button';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/ssr/Microphone';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr/UploadSimple';

export interface AudioMarkerPanelProps {
  lang: Lang;
  /** `null` while placing a brand-new marker — see this file's own header. */
  marker: AudioMarker | null;
  resolveAudioUrl: (path: string) => string;
  /** Called once an upload/recording actually succeeds, with the resulting storage path — for BOTH a new placement and a replace. */
  onAudioReady: (path: string) => void;
  /** Removes the current marker entirely. Omitted while placing a new one (nothing to delete yet). */
  onDelete?: () => void;
  /** Abandons a brand-new placement with no audio attached. Omitted once a marker already exists (see `onDelete` instead). */
  onCancelPlacement?: () => void;
}

/** `125` -> `"2:05"` — the recording timer's own display, floored at `0:00`. */
function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type View = 'listen' | 'choice' | 'recording';

export default function AudioMarkerPanel({
  lang,
  marker,
  resolveAudioUrl,
  onAudioReady,
  onDelete,
  onCancelPlacement,
}: AudioMarkerPanelProps) {
  const t = UI_LABELS[lang].activities.worksheet;
  const [view, setView] = useState<View>(marker ? 'listen' : 'choice');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();

  async function submitBlob(blob: Blob) {
    setUploading(true);
    setError(null);
    const result = await uploadAudioBlob(blob);
    setUploading(false);
    if (!result.ok) {
      setError(t.audioUploadError);
      return;
    }
    onAudioReady(result.path);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void submitBlob(file);
  }

  function startRecording() {
    setError(null);
    setView('recording');
    void recorder.start();
  }

  const recordingContent = (() => {
    const s = recorder.state;
    if (s.kind === 'requesting-permission') {
      return <p className="text-sm text-muted-foreground">{t.audioRequestingPermission}</p>;
    }
    if (s.kind === 'recording') {
      return (
        <div className="flex flex-col items-center gap-2">
          <p data-testid="audio-recording-timer" className="text-lg font-medium tabular-nums text-foreground" aria-live="polite">
            {t.audioRecording} {formatSeconds(s.seconds)} / {formatSeconds(MAX_RECORDING_SECONDS)}
          </p>
          <Button type="button" variant="destructive" data-testid="audio-stop-recording" onClick={() => recorder.stop()}>
            {t.audioStopButton}
          </Button>
        </div>
      );
    }
    if (s.kind === 'recorded') {
      return (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a short voice note has no track to caption */}
          <audio data-testid="audio-recorded-preview" controls src={s.url} className="w-full" />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              data-testid="audio-record-again"
              onClick={() => {
                recorder.discard();
                startRecording();
              }}
            >
              {t.audioRecordAgain}
            </Button>
            <Button
              type="button"
              data-testid="audio-use-recording"
              disabled={uploading}
              onClick={() => void submitBlob(s.blob)}
            >
              {uploading ? t.audioUploading : t.audioUseRecording}
            </Button>
          </div>
        </div>
      );
    }
    if (s.kind === 'permission-denied') {
      return <p className="text-sm text-destructive">{t.audioPermissionDenied}</p>;
    }
    if (s.kind === 'unsupported') {
      return <p className="text-sm text-destructive">{t.audioUnsupported}</p>;
    }
    if (s.kind === 'error') {
      return <p className="text-sm text-destructive">{t.audioRecordError}</p>;
    }
    return null;
  })();

  return (
    <div data-testid="audio-marker-panel" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{t.audioPlaceholderTitle}</span>
        {marker && onDelete && (
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t.audioDeleteButton} data-testid="audio-delete" onClick={onDelete}>
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      {view === 'listen' && marker && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a short voice note has no track to caption */}
          <audio data-testid="audio-marker-player" controls src={resolveAudioUrl(marker.path)} className="w-full" />
          <p className="text-xs text-muted-foreground">{t.audioDragHint}</p>
          <Button type="button" variant="outline" size="sm" data-testid="audio-replace" onClick={() => setView('choice')}>
            {t.audioReplaceButton}
          </Button>
        </div>
      )}

      {view === 'choice' && (
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/ogg,audio/wav,audio/*"
            data-testid="audio-file-input"
            className="sr-only"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            data-testid="audio-upload-trigger"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadSimpleIcon aria-hidden="true" />
            {uploading ? t.audioUploading : t.audioUploadButton}
          </Button>
          <Button type="button" variant="outline" data-testid="audio-record-trigger" onClick={startRecording}>
            <MicrophoneIcon aria-hidden="true" />
            {t.audioRecordButton}
          </Button>
          {error && (
            <p role="alert" data-testid="audio-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {(marker ? onDelete : onCancelPlacement) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="audio-cancel"
              onClick={() => (marker ? setView('listen') : onCancelPlacement?.())}
            >
              {t.audioCancel}
            </Button>
          )}
        </div>
      )}

      {view === 'recording' && (
        <div className="flex flex-col gap-2">
          {recordingContent}
          {error && (
            <p role="alert" data-testid="audio-error" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="button" variant="ghost" size="sm" data-testid="audio-cancel" onClick={() => setView('choice')}>
            {t.audioCancel}
          </Button>
        </div>
      )}
    </div>
  );
}
