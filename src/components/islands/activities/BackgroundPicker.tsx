/**
 * BackgroundPicker — "Fondo" capsule button + its small panel (plantillas:
 * fondo, owner decision 2026-10-23, `PROPUESTA-PLANTILLAS-2026-10-23.md`
 * §b/§g.1): lets the author give a MOLDED quiz block a decorative backdrop
 * — one of five preset gradients, or an uploaded photo. UI only, fully
 * controlled (`value`/`onChange`) — persistence, where it mounts in the
 * preview toolbar, and how `ActivityStage` paints the result are all the
 * caller's own job (`QuizBlockEditor.tsx`/`ActivityStage.tsx`, owned by
 * writer S1 — see this PR's own report for the exact integration steps).
 *
 * Uploads go through the SAME shared helper and the SAME
 * `/api/actividades/imagen` endpoint as a "Varios juegos" question image
 * (`@lib/activities/imageUpload`'s own `uploadActivityImage`, purpose
 * `'background'`) — same human pre-moderation path, same size/type/
 * dimension limits, same error vocabulary
 * (`UI_LABELS[lang].activities.worksheet.errors`).
 *
 * Kit tokens only: the trigger and panel reuse `.ingles-glass` (the one
 * glass material recipe, `SKILL.md`'s own rule) — never a second glass
 * recipe, no glossy icons, no halo. The trigger hugs its own text/swatch
 * width, never stretched.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { imagePreviewUrl } from '@/lib/activities/paths';
import { uploadActivityImage, ACCEPTED_IMAGE_TYPES } from '@/lib/activities/imageUpload';
import { BACKDROP_PRESETS, backdropCssVar, backdropLabelKey } from '@/lib/activities/backgrounds';
import type { BackdropPreset, BlockBackground } from '@/lib/activities/blocks';
import { FadeImage } from '@/components/ui/fade-image';

export interface BackgroundPickerProps {
  lang: Lang;
  value: BlockBackground | undefined;
  onChange: (next: BlockBackground | undefined) => void;
}

type UploadStatus = { kind: 'idle' } | { kind: 'uploading' } | { kind: 'error'; message: string };

/** The trigger's own small swatch — a neutral ring for "Ninguno", the preset's own gradient, or a thumbnail of the uploaded photo. */
function BackgroundSwatch({ value }: { value: BlockBackground | undefined }) {
  if (!value) {
    return (
      <span
        aria-hidden="true"
        data-testid="background-picker-trigger-swatch-none"
        className="size-4 shrink-0 rounded-full border border-border bg-background"
      />
    );
  }
  if (value.kind === 'preset') {
    return (
      <span
        aria-hidden="true"
        data-testid={`background-picker-trigger-swatch-${value.preset}`}
        className="size-4 shrink-0 rounded-full border border-border/40"
        style={{ background: backdropCssVar(value.preset) }}
      />
    );
  }
  return (
    <FadeImage
      src={imagePreviewUrl(value.path)}
      alt=""
      data-testid="background-picker-trigger-thumb"
      className="size-4 shrink-0 rounded-full object-cover"
      placeholderClassName="size-4 shrink-0 rounded-full"
    />
  );
}

export default function BackgroundPicker({ lang, value, onChange }: BackgroundPickerProps) {
  const t = UI_LABELS[lang].activities.background;
  const errors = UI_LABELS[lang].activities.worksheet.errors as Record<string, string>;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ kind: 'idle' });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Escape / outside click closes the panel — no portal (unlike
  // `UserMenu.tsx`'s own header chrome dropdown): this mounts in the
  // preview toolbar, not inside INGLÉS's permanently `overflow: hidden`
  // chrome collapse, so a plain `absolute` panel is enough here.
  //
  // Escape ALSO hands focus back to the trigger, imperatively, right here
  // — NOT from this effect's own cleanup once `open` flips back to
  // `false`: that cleanup is a passive effect, scheduled AFTER React has
  // already unmounted the panel, by which point `panelRef.current` is
  // already `null` and the browser has already dropped focus to `<body>`
  // on its own (first attempt, caught by this file's own test). An outside
  // click is deliberately left alone here — the click already moved focus
  // to whatever the visitor clicked, and yanking it back to the trigger
  // would fight that.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  // Owner bug fix round 2: the panel reads as a `role="dialog"`, so once it
  // opens, focus should land inside it rather than staying on the trigger.
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    return undefined;
  }, [open]);

  async function handleFile(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setStatus({ kind: 'error', message: errors.unsupported_media_type ?? errors.upload_failed });
      return;
    }
    setStatus({ kind: 'uploading' });
    const result = await uploadActivityImage(file, 'background');
    if (!result.ok) {
      setStatus({ kind: 'error', message: errors[result.errorCode] ?? errors.upload_failed });
      return;
    }
    setStatus({ kind: 'idle' });
    onChange({ kind: 'image', ...result.image });
  }

  function selectPreset(preset: BackdropPreset) {
    setStatus({ kind: 'idle' });
    onChange({ kind: 'preset', preset });
  }

  function selectNone() {
    setStatus({ kind: 'idle' });
    onChange(undefined);
  }

  return (
    <div ref={containerRef} className="relative inline-block" data-testid="background-picker">
      <button
        ref={triggerRef}
        type="button"
        data-testid="background-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="ingles-glass inline-flex h-8 w-fit items-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground"
      >
        <BackgroundSwatch value={value} />
        <span>{t.button}</span>
      </button>

      {/* Floating popover (owner bug: used to combine `.ingles-glass` — an
          UNLAYERED `position: relative` in `global.css` — with Tailwind's
          LAYERED `absolute` utility on the SAME element; unlayered always
          wins, so the panel rendered in normal flow and pushed the scaled
          preview frame down by its own ~190px height). The outer element
          here owns ONLY the floating position (plain `absolute`, no glass);
          the inner one owns ONLY the glass surface (`.ingles-glass`, no
          position utility) — the two rules can no longer land on the same
          node and fight. Right-aligned under the trigger (owner spec). */}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-64">
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={t.panelTitle}
            tabIndex={-1}
            data-testid="background-picker-panel"
            className="ingles-glass rounded-xl p-3"
          >
            <p className="mb-2 text-sm font-medium text-foreground">{t.panelTitle}</p>

            <button
              type="button"
              data-testid="background-picker-none"
              onClick={selectNone}
              className={cn(
                'mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                value === undefined && 'font-medium text-accent-ink',
              )}
            >
              <span aria-hidden="true" className="size-6 shrink-0 rounded-full border border-border bg-background" />
              {t.none}
            </button>

            <div className="grid grid-cols-5 gap-2" data-testid="background-picker-presets">
              {BACKDROP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  data-testid={`background-picker-preset-${preset}`}
                  aria-label={t[backdropLabelKey(preset)]}
                  aria-pressed={value?.kind === 'preset' && value.preset === preset}
                  title={t[backdropLabelKey(preset)]}
                  onClick={() => selectPreset(preset)}
                  className={cn(
                    'size-8 shrink-0 rounded-[22%] border border-border/60',
                    value?.kind === 'preset' && value.preset === preset && 'ring-2 ring-ring',
                  )}
                  style={{ background: backdropCssVar(preset) }}
                />
              ))}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                data-testid="background-picker-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handleFile(file);
                }}
              />
              {value?.kind === 'image' ? (
                <div className="flex items-center gap-2">
                  <FadeImage
                    src={imagePreviewUrl(value.path)}
                    alt=""
                    data-testid="background-picker-thumb"
                    className="h-10 w-10 rounded-md border border-border object-cover"
                    placeholderClassName="h-10 w-10 rounded-md border border-border"
                  />
                  <button
                    type="button"
                    data-testid="background-picker-change"
                    disabled={status.kind === 'uploading'}
                    onClick={() => inputRef.current?.click()}
                    className="text-xs font-medium text-accent-ink hover:underline disabled:opacity-50"
                  >
                    {status.kind === 'uploading' ? t.uploading : t.change}
                  </button>
                  <button
                    type="button"
                    data-testid="background-picker-remove"
                    onClick={selectNone}
                    className="text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    {t.remove}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="background-picker-upload"
                  disabled={status.kind === 'uploading'}
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-medium text-accent-ink hover:underline disabled:opacity-50"
                >
                  {status.kind === 'uploading' ? t.uploading : t.uploadImage}
                </button>
              )}
              {status.kind === 'error' && (
                <p data-testid="background-picker-error" className="mt-1 text-xs text-destructive">
                  {status.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
