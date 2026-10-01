import { useState } from 'react';
import { ImageBrokenIcon } from '@phosphor-icons/react/dist/ssr/ImageBroken';
import { cn } from '@/lib/utils';

/**
 * FadeImage — coherent loading states, item 6: a soft opacity fade-in once
 * an image actually decodes, and a neutral broken-image placeholder (never
 * the browser's own glyph) if it fails to load. Shared by every plain
 * content `<img>` that has no pixel-precise positioning math of its own
 * (`ModerationBlockPreview`, `ExerciseIsland`'s prompt media,
 * `QuizBlockPractice`'s context media, `DropRenderer`'s tile faces).
 *
 * NOT used by the worksheet canvas (`WorksheetZoneEditor.tsx`/
 * `WorksheetPlayer.tsx`): those need an explicit pixel width/height plus a
 * rotation transform and a fixed stacking order against zone overlays, so
 * they keep their own small inline version of this same idea rather than
 * forcing a generic component through that geometry. `ActivityCard.astro`
 * and the `cursos` pages use the equivalent plain-HTML recipe (no React
 * hook runs there) — see those files for the inline version.
 */
export interface FadeImageProps {
  src: string;
  alt: string;
  /** Classes for the `<img>` itself (sizing/object-fit/etc.) — the same classes you'd put directly on a plain `<img>`. */
  className?: string;
  /** Classes for the broken-placeholder box shown instead of the `<img>` on error. Defaults to `className`, so a simple caller needs only one prop. */
  placeholderClassName?: string;
  placeholderIconSize?: number;
  /** Present on whichever element actually renders (the `<img>` or the broken placeholder), so a caller can find it by the same id either way. */
  'data-testid'?: string;
}

export function FadeImage({
  src,
  alt,
  className,
  placeholderClassName,
  placeholderIconSize = 24,
  'data-testid': testId,
}: FadeImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div
        data-testid={testId ?? 'fade-image-broken'}
        role="img"
        aria-label={alt}
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground',
          placeholderClassName ?? className,
        )}
      >
        <ImageBrokenIcon aria-hidden="true" size={placeholderIconSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      data-testid={testId}
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
      className={cn(
        className,
        'transition-opacity duration-300 motion-reduce:transition-none',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}
