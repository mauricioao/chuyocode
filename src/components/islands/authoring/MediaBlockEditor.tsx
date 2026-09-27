/**
 * MediaBlockEditor — the image/audio/alt editor for a `media` context block
 * (slice 15, design.md §8).
 *
 * ENFORCES THE MEDIA URL POLICY AT THE POINT OF ENTRY (`exerciseMedia.ts`'s
 * header): `image`/`audio` are committed to the draft ONLY when they are
 * empty (cleared) or pass `isAllowedMediaUrl` (`https:`, allow-listed
 * host). An invalid value stays visible in the field with an inline error,
 * but is never written to the draft — so `ExercisePreview`'s real
 * `ExerciseIsland` can never receive a `javascript:`/`http:`/unlisted-host
 * URL to begin with, independent of `parseBlock`'s own defense-in-depth
 * check on the STORED path.
 *
 * COPY IS LOCAL, same rule as every other island in this codebase.
 */
import { useState } from 'react';
import { isAllowedMediaUrl } from '@/lib/exerciseMedia';
import type { MediaBlock } from '@/lib/exercisePayload';

export const COPY = {
  es: {
    image: 'URL de la imagen',
    audio: 'URL del audio',
    alt: 'Texto alternativo',
    invalidUrl: 'Debe ser una URL https en un dominio permitido.',
    remove: 'Quitar este bloque multimedia',
  },
  en: {
    image: 'Image URL',
    audio: 'Audio URL',
    alt: 'Alt text',
    invalidUrl: 'Must be an https URL on an allowed domain.',
    remove: 'Remove this media block',
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function copyFor(lang: string): Copy {
  return lang === 'en' ? COPY.en : COPY.es;
}

export interface MediaBlockEditorProps {
  block: MediaBlock;
  lang: string;
  onChangeImage: (image: string | undefined) => void;
  onChangeAudio: (audio: string | undefined) => void;
  onChangeAlt: (alt: string | undefined) => void;
  onRemove: () => void;
}

/** Is `value` acceptable to COMMIT — empty (clears the field) or allow-listed. */
function isCommittable(value: string): boolean {
  return value === '' || isAllowedMediaUrl(value);
}

export default function MediaBlockEditor({
  block,
  lang,
  onChangeImage,
  onChangeAudio,
  onChangeAlt,
  onRemove,
}: MediaBlockEditorProps) {
  const t = copyFor(lang);

  // Local display state, independent of the committed draft value: an
  // author mid-typing a URL sees exactly what they typed, including a
  // currently-invalid prefix, without the draft ever holding that value.
  const [imageText, setImageText] = useState(block.image ?? '');
  const [audioText, setAudioText] = useState(block.audio ?? '');
  const imageInvalid = imageText !== '' && !isAllowedMediaUrl(imageText);
  const audioInvalid = audioText !== '' && !isAllowedMediaUrl(audioText);

  function handleImageChange(value: string) {
    setImageText(value);
    if (isCommittable(value)) onChangeImage(value === '' ? undefined : value);
  }

  function handleAudioChange(value: string) {
    setAudioText(value);
    if (isCommittable(value)) onChangeAudio(value === '' ? undefined : value);
  }

  const imageFieldId = `${block.id}-image`;
  const audioFieldId = `${block.id}-audio`;
  const altFieldId = `${block.id}-alt`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-100">{t.image}</span>
        <button
          type="button"
          aria-label={t.remove}
          data-testid={`remove-block-${block.id}`}
          className="text-sm text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          &times;
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={imageFieldId} className="sr-only">
          {t.image}
        </label>
        <input
          id={imageFieldId}
          type="text"
          data-testid={`media-image-${block.id}`}
          value={imageText}
          aria-invalid={imageInvalid}
          onChange={(event) => handleImageChange(event.target.value)}
          className="w-full rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {imageInvalid && (
          <p data-testid={`media-image-error-${block.id}`} className="text-sm text-destructive">
            {t.invalidUrl}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={audioFieldId} className="sr-only">
          {t.audio}
        </label>
        <input
          id={audioFieldId}
          type="text"
          data-testid={`media-audio-${block.id}`}
          value={audioText}
          aria-invalid={audioInvalid}
          onChange={(event) => handleAudioChange(event.target.value)}
          className="w-full rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {audioInvalid && (
          <p data-testid={`media-audio-error-${block.id}`} className="text-sm text-destructive">
            {t.invalidUrl}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={altFieldId} className="sr-only">
          {t.alt}
        </label>
        <input
          id={altFieldId}
          type="text"
          placeholder={t.alt}
          data-testid={`media-alt-${block.id}`}
          value={block.alt ?? ''}
          onChange={(event) => onChangeAlt(event.target.value === '' ? undefined : event.target.value)}
          className="w-full rounded-md border border-input bg-input/30 px-3 py-2 text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}
