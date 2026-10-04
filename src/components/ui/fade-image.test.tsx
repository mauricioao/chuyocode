// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
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

  it('falls back to className for the placeholder when placeholderClassName is omitted', () => {
    render(<FadeImage src="/broken.webp" alt="" className="h-20 w-20" />);
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    expect(screen.getByTestId('fade-image-broken').className).toContain('h-20');
  });
});
