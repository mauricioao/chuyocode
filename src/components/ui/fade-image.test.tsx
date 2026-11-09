// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FadeImage } from './fade-image';

afterEach(() => cleanup());

describe('FadeImage', () => {
  it('starts at opacity-0 and fades in once the image loads', () => {
    render(<FadeImage src="/x.webp" alt="" className="h-20 w-20" />);
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('replaces the <img> with a neutral placeholder (never the browser glyph) on error', () => {
    render(<FadeImage src="/broken.webp" alt="Portada" className="h-20 w-20" />);
    const img = document.querySelector('img') as HTMLImageElement;
    fireEvent.error(img);

    expect(document.querySelector('img')).toBeNull();
    const placeholder = screen.getByTestId('fade-image-broken');
    expect(placeholder.getAttribute('role')).toBe('img');
    expect(placeholder.getAttribute('aria-label')).toBe('Portada');
  });

  // A server-rendered <img> can finish loading BEFORE hydration attaches
  // `onLoad` — its load event is then gone for good, and the image used to
  // stay invisible at opacity-0 (seen on a question's thumbnail in the
  // template editor). Mounting must read the element's own state instead.
  describe('an image that finished before React was listening', () => {
    function stubImageState(complete: boolean, naturalWidth: number) {
      const proto = HTMLImageElement.prototype;
      const completeSpy = vi.spyOn(proto, 'complete', 'get').mockReturnValue(complete);
      const widthSpy = vi.spyOn(proto, 'naturalWidth', 'get').mockReturnValue(naturalWidth);
      return () => {
        completeSpy.mockRestore();
        widthSpy.mockRestore();
      };
    }

    it('shows an image that already loaded, without waiting for a load event', () => {
      const restore = stubImageState(true, 480);
      try {
        render(<FadeImage src="/x.webp" alt="" className="h-20 w-20" />);
        expect((document.querySelector('img') as HTMLImageElement).className).toContain('opacity-100');
      } finally {
        restore();
      }
    });

    it('keeps waiting (never "broken") for a finished image with no size of its own, e.g. an SVG', () => {
      const restore = stubImageState(true, 0);
      try {
        render(<FadeImage src="/icon.svg" alt="" className="h-20 w-20" />);
        const img = document.querySelector('img') as HTMLImageElement;
        expect(img.className).toContain('opacity-0');
        expect(screen.queryByTestId('fade-image-broken')).toBeNull();
      } finally {
        restore();
      }
    });
  });

  it('falls back to className for the placeholder when placeholderClassName is omitted', () => {
    render(<FadeImage src="/broken.webp" alt="" className="h-20 w-20" />);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    expect(screen.getByTestId('fade-image-broken').className).toContain('h-20');
  });
});
