import { describe, it, expect } from 'vitest';
import { toVideoEmbed } from './video';

describe('toVideoEmbed', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871', 'https://player.vimeo.com/video/76979871'],
    ['https://player.vimeo.com/video/76979871', 'https://player.vimeo.com/video/76979871'],
  ])('maps %s to %s', (input, expected) => {
    expect(toVideoEmbed(input)).toEqual({
      provider: expected.includes('youtube') ? 'youtube' : 'vimeo',
      embedUrl: expected,
    });
  });

  it('rejects a non-https url', () => {
    expect(toVideoEmbed('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('rejects a non-allowlisted host', () => {
    expect(toVideoEmbed('https://evil.example.com/watch?v=x')).toBeNull();
  });

  it('rejects a YouTube url with no v param', () => {
    expect(toVideoEmbed('https://www.youtube.com/watch')).toBeNull();
  });

  it('rejects a malformed Vimeo id', () => {
    expect(toVideoEmbed('https://vimeo.com/not-a-number')).toBeNull();
  });

  it('rejects a malformed url string', () => {
    expect(toVideoEmbed('not a url')).toBeNull();
  });
});
