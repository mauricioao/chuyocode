import { describe, it, expect } from 'vitest';
import { estimateSpeechMs } from './estimateSpeechMs';

describe('estimateSpeechMs', () => {
  it('never estimates below the floor, even for a single short word', () => {
    expect(estimateSpeechMs('Hi', 1)).toBeGreaterThanOrEqual(900);
  });

  it('estimates longer for more words at the same rate', () => {
    const short = estimateSpeechMs('Break a leg', 1);
    const long = estimateSpeechMs('Better late than never, my old friend, better late than never', 1);
    expect(long).toBeGreaterThan(short);
  });

  it('estimates longer at a slower rate for the same text', () => {
    const text = 'Better late than never, my old friend, said she';
    const normal = estimateSpeechMs(text, 1);
    const slow = estimateSpeechMs(text, 0.5);
    expect(slow).toBeGreaterThan(normal);
  });

  it('falls back to rate 1 for a non-positive rate instead of dividing oddly', () => {
    const text = 'Better late than never, my old friend, said she';
    expect(estimateSpeechMs(text, 0)).toBe(estimateSpeechMs(text, 1));
    expect(estimateSpeechMs(text, -1)).toBe(estimateSpeechMs(text, 1));
  });

  it('treats blank text as zero words (still floored)', () => {
    expect(estimateSpeechMs('   ', 1)).toBe(900);
  });
});
