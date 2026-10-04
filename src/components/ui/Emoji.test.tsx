// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Emoji } from './Emoji';

afterEach(() => cleanup());

describe('Emoji', () => {
  it('renders AVIF/WebP sources with 1x/2x/4x density descriptors', () => {
    const { container } = render(<Emoji name="trophy" />);
    const sources = container.querySelectorAll('source');
    expect(sources[0].getAttribute('type')).toBe('image/avif');
    expect(sources[0].getAttribute('srcset')).toBe(
      '/images/emoji/trophy-v1-64.avif 1x, /images/emoji/trophy-v1-128.avif 2x, /images/emoji/trophy-v1-256.avif 4x',
    );
    expect(sources[1].getAttribute('type')).toBe('image/webp');
    expect(sources[1].getAttribute('srcset')).toBe(
      '/images/emoji/trophy-v1-64.webp 1x, /images/emoji/trophy-v1-128.webp 2x, /images/emoji/trophy-v1-256.webp 4x',
    );
  });

  it('falls back to the smallest WebP on the <img> itself', () => {
    const { container } = render(<Emoji name="rocket" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/images/emoji/rocket-v1-64.webp');
  });

  it('is decorative by default', () => {
    const { container } = render(<Emoji name="books" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.alt).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  });

  it('accepts an accessible label and drops aria-hidden', () => {
    const { container } = render(<Emoji name="rocket" label="Rocket" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.alt).toBe('Rocket');
    expect(img.hasAttribute('aria-hidden')).toBe(false);
  });

  it('defaults size to 48 and accepts an override', () => {
    const { container, rerender } = render(<Emoji name="llama" />);
    let img = container.querySelector('img') as HTMLImageElement;
    expect(img.width).toBe(48);
    expect(img.height).toBe(48);

    rerender(<Emoji name="llama" size={32} />);
    img = container.querySelector('img') as HTMLImageElement;
    expect(img.width).toBe(32);
    expect(img.height).toBe(32);
  });

  it('forwards data-testid to the <picture> root', () => {
    const { getByTestId } = render(<Emoji name="sparkles" data-testid="my-emoji" />);
    expect(getByTestId('my-emoji').tagName).toBe('PICTURE');
  });
});
