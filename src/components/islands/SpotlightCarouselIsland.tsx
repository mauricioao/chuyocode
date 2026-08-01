/**
 * SpotlightCarouselIsland — the featured "Destacados" carousel (shadcn Carousel
 * + Embla). CLIENT half of the Spotlight block.
 *
 * `SpotlightCarousel.astro` runs the server-only image pipeline (buildImage
 * needs env + @sanity/image-url) and passes each slide down as PLAIN DATA
 * (src/srcset/sizes/lqip already resolved), so nothing server-only ships to the
 * browser — the same server→island split the hero uses.
 *
 * WHY a carousel with a WIDE (16/9) cover instead of the old single 2/3 poster:
 * the previous Spotlight forced a portrait poster into a 16/9 box, stretching
 * and distorting the art. Each slide here uses the landscape hero backdrop
 * (heroBackground, falling back to the cover) at its native 16/9 ratio with
 * `object-cover`, so the image never distorts.
 *
 * Behavior (mirrors HeroCarouselIsland):
 *   - Autoplay every `interval` ms (default 7000), pausing on hover/focus and
 *     when the tab is hidden.
 *   - `prefers-reduced-motion: reduce` DISABLES autoplay entirely.
 *   - A single slide renders WITHOUT arrows and WITHOUT autoplay.
 */
import * as React from 'react';
import Autoplay from 'embla-carousel-autoplay';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import { buttonVariants } from '@/components/ui/button';
import { badgeVariants } from '@/components/ui/badge';

/** One resolved image: everything an <img> needs, computed server-side. */
export interface SpotlightImage {
  src: string;
  srcset: string;
  sizes: string;
  /** Base64 blur-up placeholder; absent when the asset had none. */
  lqip?: string;
}

/** A spotlight slide as plain, already-resolved data (no server-only refs). */
export interface SpotlightSlideData {
  id?: string;
  href: string;
  title: string;
  /** Long editorial synopsis (or tagline fallback) for the panel. */
  body?: string;
  /** Resolved wide cover (heroBackground or cover fallback). Absent → no image. */
  image?: SpotlightImage | null;
}

export interface SpotlightCarouselIslandProps {
  slides: SpotlightSlideData[];
  /** Small eyebrow heading above each title. */
  heading?: string;
  /** CTA label for the deep-link button. */
  ctaLabel?: string;
  /** Auto-advance interval in ms. Default 7000. */
  interval?: number;
}

/** True when the user asked for reduced motion (SSR-safe: false on the server). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function SpotlightCarouselIsland({
  slides,
  heading,
  ctaLabel = 'Read more',
  interval = 7000,
}: SpotlightCarouselIslandProps) {
  const isStatic = slides.length <= 1;
  const reduceMotion = prefersReducedMotion();

  const autoplay = React.useRef(
    Autoplay({
      delay: interval,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
      stopOnFocusIn: true,
    }),
  );
  const plugins = isStatic || reduceMotion ? [] : [autoplay.current];

  // Pause autoplay when the tab is hidden; resume when visible again.
  React.useEffect(() => {
    if (isStatic || reduceMotion) return;
    const plugin = autoplay.current;
    const onVisibility = () => {
      if (document.hidden) plugin.stop();
      else plugin.play();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isStatic, reduceMotion]);

  return (
    <Carousel
      className="spotlight-carousel w-full"
      opts={{ loop: !isStatic }}
      plugins={plugins}
      aria-label="Featured content"
      data-spotlight-carousel
    >
      <CarouselContent>
        {slides.map((slide, index) => (
          <CarouselItem key={slide.id ?? index} data-spotlight-slide>
            <article className="grid items-center gap-6 overflow-hidden bg-card text-card-foreground shadow-elevation-2 ring-1 ring-foreground/10 sm:gap-10 lg:grid-cols-2">
              {/* Wide cover, left column — native 16/9, no distortion. */}
              <a
                href={slide.href}
                className="group relative block aspect-[16/9] w-full overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={slide.title}
                tabIndex={-1}
              >
                <div
                  className="absolute inset-0"
                  style={
                    slide.image?.lqip
                      ? {
                          backgroundImage: `url(${slide.image.lqip})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                >
                  {slide.image?.src && (
                    <img
                      src={slide.image.src}
                      srcSet={slide.image.srcset}
                      sizes={slide.image.sizes}
                      alt={slide.title}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                </div>
              </a>

              {/* Editorial column: eyebrow, title, synopsis, CTA. */}
              <div className="flex flex-col gap-4 p-6 sm:p-10">
                {heading && (
                  <span
                    className={badgeVariants({
                      variant: 'outline',
                      className: 'w-fit uppercase tracking-wide text-accent',
                    })}
                  >
                    {heading}
                  </span>
                )}
                <h3 className="font-display text-2xl font-semibold text-foreground sm:text-4xl">
                  {slide.title}
                </h3>
                {slide.body && (
                  <p className="max-w-prose text-base text-muted-foreground">
                    {slide.body}
                  </p>
                )}
                <a
                  href={slide.href}
                  className={buttonVariants({
                    variant: 'default',
                    size: 'lg',
                    className: 'w-fit px-5 py-2.5',
                  })}
                  data-spotlight-cta
                >
                  {ctaLabel}
                </a>
              </div>
            </article>
          </CarouselItem>
        ))}
      </CarouselContent>

      {/* Arrows only when there is more than one slide to move between. */}
      {!isStatic && (
        <>
          <CarouselPrevious className="left-3 sm:left-4" />
          <CarouselNext className="right-3 sm:right-4" />
        </>
      )}
    </Carousel>
  );
}
