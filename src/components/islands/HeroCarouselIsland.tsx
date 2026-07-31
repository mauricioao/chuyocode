/**
 * HeroCarouselIsland — the interactive hero billboard (shadcn Carousel + Embla).
 *
 * This is the CLIENT half of the hero: `HeroCarousel.astro` runs the server-only
 * image pipeline (buildImage needs env + @sanity/image-url) and passes each
 * slide down as PLAIN DATA (src/srcset/sizes/lqip already resolved), so nothing
 * server-only ever ships to the browser.
 *
 * Behavior preserved from the previous vanilla-JS hero:
 *   - Autoplay every `interval` ms (default 6000), via embla-carousel-autoplay.
 *   - Pauses on pointer hover/focus (the plugin's stopOnInteraction/stopOnFocus)
 *     and when the tab is hidden (visibilitychange).
 *   - `prefers-reduced-motion: reduce` DISABLES autoplay entirely.
 *   - Full-bleed backdrop with an LQIP blur-up placeholder behind the <img>.
 *   - Left-aligned, vertically-centered info block (logo?, title, tagline?, CTA)
 *     over a soft bottom-to-top scrim (shademanga overlap look).
 *   - loop so it wraps like the old modulo advance.
 *
 * NOT carried over (accepted tradeoff): the Astro `transition:name` cover morph
 * — View Transitions directives do not exist inside a React island. The row
 * MediaCards keep their morph; the hero does not.
 *
 * A single slide renders WITHOUT arrows and WITHOUT autoplay (nothing to rotate)
 * — Embla is still used so the markup/styling path stays identical.
 */
import * as React from 'react';
import Autoplay from 'embla-carousel-autoplay';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import { buttonVariants } from '@/components/ui/button';

/** One resolved image: everything an <img> needs, computed server-side. */
export interface HeroImage {
  src: string;
  srcset: string;
  sizes: string;
  /** Base64 blur-up placeholder; absent when the asset had none. */
  lqip?: string;
}

/** A hero slide as plain, already-resolved data (no server-only refs). */
export interface HeroSlideData {
  id?: string;
  href: string;
  title: string;
  tagline?: string;
  ctaLabel?: string;
  /** Resolved backdrop (heroBackground or cover fallback). Absent → no image. */
  image?: HeroImage | null;
  /** Resolved title-treatment logo. Absent → text title only. */
  logo?: HeroImage | null;
}

export interface HeroCarouselIslandProps {
  slides: HeroSlideData[];
  /** Auto-advance interval in ms. Default 6000. */
  interval?: number;
  /** Default CTA label when a slide omits its own. */
  defaultCtaLabel?: string;
}

/** True when the user asked for reduced motion (SSR-safe: false on the server). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function HeroCarouselIsland({
  slides,
  interval = 6000,
  defaultCtaLabel = 'Leer',
}: HeroCarouselIslandProps) {
  const isStatic = slides.length <= 1;
  const reduceMotion = prefersReducedMotion();

  // Autoplay plugin: only when there is more than one slide AND motion is
  // allowed. stopOnInteraction:false keeps rotating after a manual swipe;
  // stopOnMouseEnter/stopOnFocusIn pause on hover/keyboard focus.
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
      className="hero-carousel w-full"
      opts={{ loop: !isStatic }}
      plugins={plugins}
      aria-label="Featured content"
      data-hero-carousel
    >
      <CarouselContent className="ml-0">
        {slides.map((slide, index) => (
          <CarouselItem
            key={slide.id ?? index}
            className="pl-0"
            data-hero-slide
            data-index={index}
          >
            <div className="relative h-[88vh] min-h-[520px] w-full overflow-hidden">
              {/* Full-bleed backdrop + LQIP blur-up placeholder behind it. */}
              <div
                className="absolute inset-0 bg-muted"
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
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              {/* Soft bottom-to-top scrim (shademanga overlap look): solid black
                  at the very bottom, long gentle ramp to transparent. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black from-15% via-black/40 to-transparent" />

              {/* Left-aligned, vertically-centered info block. */}
              <div className="absolute inset-y-0 left-0 flex flex-col items-start justify-center gap-4 p-6 text-left sm:pl-12 md:pl-16 lg:pl-20">
                <div className="flex max-w-xl flex-col items-start gap-4">
                  {slide.logo?.src && (
                    <img
                      src={slide.logo.src}
                      srcSet={slide.logo.srcset}
                      sizes={slide.logo.sizes}
                      alt=""
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="hero-logo h-auto max-h-24 w-auto max-w-[14rem] object-contain sm:max-h-36 sm:max-w-[22rem]"
                      data-hero-logo
                    />
                  )}
                  <h2 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
                    {slide.title}
                  </h2>
                  {slide.tagline && (
                    <p className="max-w-prose font-display text-sm font-medium text-zinc-100 sm:text-base">
                      {slide.tagline}
                    </p>
                  )}
                  <a
                    href={slide.href}
                    className={buttonVariants({
                      variant: 'default',
                      size: 'lg',
                      className: 'hero-cta w-fit px-5 py-2.5',
                    })}
                    data-hero-cta
                  >
                    {slide.ctaLabel ?? defaultCtaLabel}
                  </a>
                </div>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
