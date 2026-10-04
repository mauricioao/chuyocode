import { emojiSrcSet, emojiFallbackSrc, type EmojiName } from '@/lib/emoji';
import { cn } from '@/lib/utils';

/**
 * Emoji — React twin of `Emoji.astro` (see that file's own header for the
 * design rationale; both read the shared slug list in `@/lib/emoji`). Used
 * as a PLAIN child inside an already-hydrated island
 * (`ActivityPracticeIsland`, `PresentationIsland`, `MisActividadesIsland`)
 * — never its own `client:` directive, same posture as `ShareDialog` nested
 * inside `MisActividadesIsland`.
 */
export interface EmojiProps {
  name: EmojiName;
  /** CSS pixel size (square) — keep this a small sticker accent, 32-64px. */
  size?: number;
  /** Accessible label. Omitted (default): decorative, `alt=""` + `aria-hidden`. */
  label?: string;
  className?: string;
  'data-testid'?: string;
}

export function Emoji({ name, size = 48, label, className, 'data-testid': testId }: EmojiProps) {
  return (
    <picture className={cn('inline-block align-middle', className)} data-testid={testId}>
      <source type="image/avif" srcSet={emojiSrcSet(name, 'avif')} />
      <source type="image/webp" srcSet={emojiSrcSet(name, 'webp')} />
      <img
        src={emojiFallbackSrc(name)}
        width={size}
        height={size}
        alt={label ?? ''}
        aria-hidden={label ? undefined : true}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
